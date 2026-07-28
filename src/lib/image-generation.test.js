const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMinimax, generateOpenAiCompatible, generateText, normalizeImageApiConfig } = require("./image-generation");

test("image API defaults to the verified local image gateway", () => {
  assert.deepEqual(normalizeImageApiConfig({}), {
    provider: "local-openai",
    baseUrl: "http://localhost:62104/v1",
    model: "gpt-image-2"
  });
});

test("OpenAI-compatible generation accepts base64 images", async () => {
  const result = await generateOpenAiCompatible({
    config: normalizeImageApiConfig({}), apiKey: "secret", prompt: "团建封面",
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("image").toString("base64") }] }), { status: 200 })
  });
  assert.equal(result.bytes.toString(), "image");
});

test("MiniMax uses a 3:4 request and returns downloaded bytes", async () => {
  const requests = [];
  const result = await generateMinimax({
    config: normalizeImageApiConfig({ provider: "minimax" }), apiKey: "secret", prompt: "团建封面",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes("image_generation")) return new Response(JSON.stringify({ data: { image_urls: ["https://cdn.example.com/a.jpg"] }, base_resp: { status_code: 0 } }), { status: 200 });
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
  });
  assert.equal(JSON.parse(requests[0].options.body).aspect_ratio, "3:4");
  assert.equal(result.bytes.length, 4);
});

test("local compatible text generation returns copy", async () => {
  const result = await generateText({
    config: normalizeImageApiConfig({}), apiKey: "secret", prompt: "写文案",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "团建文案" } }] }), { status: 200 })
  });
  assert.equal(result, "团建文案");
});
