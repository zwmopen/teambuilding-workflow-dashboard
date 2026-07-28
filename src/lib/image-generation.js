const fs = require("node:fs");
const path = require("node:path");

const PROVIDER_DEFAULTS = {
  "local-openai": { baseUrl: "http://localhost:62104/v1", model: "gpt-image-2" },
  bytecat: { baseUrl: "https://codecdn.bytecatcode.org/v1", model: "gpt-image-2" },
  minimax: { baseUrl: "https://api.minimaxi.com/v1", model: "image-01" }
};

function normalizeImageApiConfig(value = {}) {
  const provider = Object.hasOwn(PROVIDER_DEFAULTS, value.provider) ? value.provider : "local-openai";
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    baseUrl: String(value.baseUrl || defaults.baseUrl).replace(/\/+$/, ""),
    model: String(value.model || defaults.model)
  };
}

function assertSafeUrl(value, label = "接口地址") {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label}格式不正确`); }
  if (parsed.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`${label}必须使用 HTTPS；本机接口可使用 localhost`);
  }
  return parsed;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || data?.base_resp?.status_msg || raw || `HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 500));
  }
  return data || {};
}

function imageExtension(bytes, contentType = "") {
  if (String(contentType).includes("webp")) return ".webp";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  return ".jpg";
}

function imageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (!length) break;
      offset += length + 2;
    }
  }
  return { width: 0, height: 0 };
}

function saveBytes(bytes, outputRoot, index, contentType = "") {
  if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw new Error("生成图片为空或超过 40 MB");
  fs.mkdirSync(outputRoot, { recursive: true });
  const ext = imageExtension(bytes, contentType);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = path.join(outputRoot, `api-image-${stamp}-${String(index + 1).padStart(2, "0")}${ext}`);
  fs.writeFileSync(outputFile, bytes);
  return { outputFile, bytes: bytes.length, ...imageDimensions(bytes) };
}

async function fetchImageBytes(imageUrl, fetchImpl = fetch) {
  assertSafeUrl(imageUrl, "图片下载地址");
  const response = await fetchImpl(imageUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "" };
}

async function generateOpenAiCompatible({ config, apiKey, prompt, referencePaths = [], fetchImpl = fetch }) {
  const useEdit = referencePaths.length > 0;
  const endpoint = `${config.baseUrl}/images/${useEdit ? "edits" : "generations"}`;
  assertSafeUrl(endpoint);
  let body;
  let headers = { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
  if (useEdit) {
    body = new FormData();
    body.append("model", config.model);
    body.append("prompt", prompt);
    body.append("n", "1");
    body.append("size", "1024x1536");
    for (const filePath of referencePaths.slice(0, 8)) {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error("参考图不存在或超过 20 MB");
      body.append("image", new Blob([fs.readFileSync(filePath)], { type: imageMimeType(filePath) }), path.basename(filePath));
    }
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ model: config.model, prompt, n: 1, size: "1024x1536", response_format: "b64_json" });
  }
  const response = await fetchImpl(endpoint, { method: "POST", headers, body });
  const data = await readJsonResponse(response);
  const item = data.data?.[0];
  if (!item?.b64_json && !item?.url) throw new Error("接口没有返回图片数据");
  if (item.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), contentType: "image/png" };
  return fetchImageBytes(item.url, fetchImpl);
}

async function generateMinimax({ config, apiKey, prompt, fetchImpl = fetch }) {
  const endpoint = `${config.baseUrl}/image_generation`;
  assertSafeUrl(endpoint);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, prompt, aspect_ratio: "3:4", response_format: "url", n: 1, prompt_optimizer: true })
  });
  const data = await readJsonResponse(response);
  if (data.base_resp && Number(data.base_resp.status_code) !== 0) {
    throw new Error(String(data.base_resp.status_msg || `MiniMax 状态码 ${data.base_resp.status_code}`).slice(0, 500));
  }
  const imageUrl = data.data?.image_urls?.[0];
  if (!imageUrl) throw new Error("MiniMax 没有返回图片地址");
  return fetchImageBytes(imageUrl, fetchImpl);
}

async function generateText({ config, apiKey, prompt, model = "gpt-5.6-terra", fetchImpl = fetch }) {
  if (!apiKey) throw new Error("没有找到本机 API 密钥");
  if (!["local-openai", "bytecat"].includes(config.provider)) throw new Error("当前文案生成只支持 OpenAI 兼容接口");
  const endpoint = `${config.baseUrl}/chat/completions`;
  assertSafeUrl(endpoint);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    })
  });
  const data = await readJsonResponse(response);
  const content = data.choices?.[0]?.message?.content;
  if (!String(content || "").trim()) throw new Error("文案接口没有返回正文");
  return String(content).trim();
}

async function generateImages(options) {
  const config = normalizeImageApiConfig(options.config);
  if (!options.apiKey) throw new Error("没有找到本机生图 API 密钥");
  const count = [1, 2, 6].includes(Number(options.count)) ? Number(options.count) : 1;
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const generated = config.provider === "minimax"
      ? await generateMinimax({ ...options, config })
      : await generateOpenAiCompatible({ ...options, config });
    results.push({
      ...saveBytes(generated.bytes, options.outputRoot, index, generated.contentType),
      provider: config.provider,
      model: config.model
    });
  }
  return results;
}

module.exports = {
  PROVIDER_DEFAULTS,
  generateImages,
  generateMinimax,
  generateOpenAiCompatible,
  generateText,
  imageDimensions,
  normalizeImageApiConfig
};
