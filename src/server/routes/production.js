/**
 * 素材生产路由
 * 匹配 /api/production/*, /api/image-api/*, /api/text-api/*, /api/workbench-assistant/*
 * @returns {Promise<boolean>} true 表示已匹配并处理
 */
async function handle(req, res, pathname, parsed, ctx) {
  const {
    send, sendJson, getBody, readJson, writeJson,
    isAllowedFile, exists,
    APP_SETTINGS_FILE, IMAGE_REVIEW_ROOT,
    pendingProductionPlans,
    productionJobs, productionAbortControllers,
    createProductionPlans, publicProductionJob, safeProductionOptions,
    productionResumeScope, saveProductionJob, updateProductionJob,
    runProductionJob, productionWorkbenchProducts, packProductionWorks,
    saveImageApiSecret, saveTextApiSecret,
    publicImageApiSettings, publicTextApiSettings,
    imageApiCredential, textApiCredential,
    interpretWorkbenchAssistantCommand,
    collectReferenceImages, materialFacts, buildProductionPrompt,
    safeOutputName, generateImages, networkFetch,
    normalizeImageApiConfig, normalizeTextApiConfig,
  } = ctx;

  const path = require("path");
  const crypto = require("crypto");
  const fs = require("fs");

  // --- /api/production/* ---
  if (pathname === "/api/production/plan" && req.method === "POST") {
    try {
      const body = JSON.parse(await getBody(req, 256_000) || "{}");
      return sendJson(res, { ok: true, plan: await createProductionPlans(body) });
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/production/workspace" && req.method === "GET") {
    return sendJson(res, { ok: true, workspace: productionWorkbenchProducts() });
  }

  if (pathname === "/api/production/tasks" && req.method === "GET") {
    return sendJson(res, {
      ok: true,
      tasks: [...productionJobs.values()]
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .map(publicProductionJob)
    });
  }

  if (pathname === "/api/production/pack" && req.method === "POST") {
    try {
      const body = JSON.parse(await getBody(req, 256_000) || "{}");
      return sendJson(res, packProductionWorks(body.paths));
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error.message }));
    }
  }

  if (pathname === "/api/production/run" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const planBundle = pendingProductionPlans.get(String(body.planId || ""));
    if (!planBundle) return send(res, 409, JSON.stringify({ error: "出图计划已失效，请重新点击生成计划" }));
    if (!body.confirmed) return send(res, 409, JSON.stringify({ error: "请先查看并确认出图计划" }));
    const job = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
      planId: planBundle.id,
      mode: planBundle.mode,
      status: "running",
      phase: "starting",
      message: "已确认计划，正在准备生产",
      progress: 0,
      total: planBundle.totals.images,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputRoots: [],
      results: [],
      failures: [],
      qualityReports: [],
      workRoots: {},
      planBundle,
      options: safeProductionOptions({ ...body, runScope: "calibration" }),
      cancelRequested: false,
      error: ""
    };
    productionJobs.set(job.id, job);
    saveProductionJob(job);
    pendingProductionPlans.delete(planBundle.id);
    runProductionJob(job, planBundle, { ...body, runScope: "calibration" }).catch((error) => {
      updateProductionJob(job, {
        status: "failed",
        phase: "failed",
        finishedAt: new Date().toISOString(),
        message: "生产中断，已生成的文件仍保留在待审区。",
        error: String(error?.message || error).slice(0, 1000)
      });
    }).finally(() => productionAbortControllers.delete(job.id));
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  const productionJobMatch = pathname.match(/^\/api\/production\/jobs\/([^/]+)$/);
  if (productionJobMatch && req.method === "GET") {
    const job = productionJobs.get(decodeURIComponent(productionJobMatch[1]));
    if (!job) return send(res, 404, JSON.stringify({ error: "没有找到这次生产任务" }));
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  const resumeProductionJobMatch = pathname.match(/^\/api\/production\/jobs\/([^/]+)\/resume$/);
  if (resumeProductionJobMatch && req.method === "POST") {
    const job = productionJobs.get(decodeURIComponent(resumeProductionJobMatch[1]));
    if (!job) return send(res, 404, JSON.stringify({ error: "没有找到这次生产任务" }));
    if (job.status === "running") return send(res, 409, JSON.stringify({ error: "这次任务仍在生产中" }));
    if (!job.planBundle || !job.options) return send(res, 409, JSON.stringify({ error: "旧任务没有可恢复的生产计划" }));
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const resumeScope = productionResumeScope(job);
    const retryOptions = safeProductionOptions({
      ...job.options,
      ...body,
      prompt: body.prompt || job.options.prompt,
      quality: body.quality || job.options.quality,
      outputPrefix: job.options.outputPrefix,
      runScope: resumeScope
    });
    job.cancelRequested = false;
    runProductionJob(job, job.planBundle, retryOptions).catch((error) => {
      updateProductionJob(job, {
        status: "failed",
        phase: "failed",
        finishedAt: new Date().toISOString(),
        message: "继续生产时发生中断，已完成文件仍保留。",
        error: String(error?.message || error).slice(0, 1000)
      });
    }).finally(() => productionAbortControllers.delete(job.id));
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  const cancelProductionJobMatch = pathname.match(/^\/api\/production\/jobs\/([^/]+)\/cancel$/);
  if (cancelProductionJobMatch && req.method === "POST") {
    const job = productionJobs.get(decodeURIComponent(cancelProductionJobMatch[1]));
    if (!job) return send(res, 404, JSON.stringify({ error: "没有找到这次生产任务" }));
    if (job.status !== "running") return sendJson(res, { ok: true, job: publicProductionJob(job) });
    job.cancelRequested = true;
    productionAbortControllers.get(job.id)?.abort();
    updateProductionJob(job, {
      message: "已收到停止请求；完成当前页面后停止，已生成内容不会删除。"
    });
    return sendJson(res, { ok: true, job: publicProductionJob(job) });
  }

  // --- /api/image-api/* & /api/text-api/* & /api/workbench-assistant/* ---
  if (pathname === "/api/image-api/config" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = saveImageApiSecret(body);
    const previous = readJson(APP_SETTINGS_FILE, {});
    writeJson(APP_SETTINGS_FILE, { ...previous, imageApi: config });
    return sendJson(res, { ok: true, imageApi: publicImageApiSettings(config) });
  }

  if (pathname === "/api/text-api/config" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = saveTextApiSecret(body);
    const previous = readJson(APP_SETTINGS_FILE, {});
    writeJson(APP_SETTINGS_FILE, { ...previous, textApi: config });
    return sendJson(res, { ok: true, textApi: publicTextApiSettings(config) });
  }

  if (pathname === "/api/workbench-assistant/interpret" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 16_000) || "{}");
    try {
      return sendJson(res, {
        ok: true,
        interpretation: await interpretWorkbenchAssistantCommand(body.command)
      });
    } catch (error) {
      return send(res, 503, JSON.stringify({
        error: "智能理解暂时不可用",
        detail: String(error?.message || error).slice(0, 300)
      }));
    }
  }

  if (pathname === "/api/image-api/test" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = normalizeImageApiConfig(body);
    const apiKey = imageApiCredential(config.provider, body.apiKey);
    if (!apiKey) {
      if (body.quiet) return sendJson(res, { ok: false, available: false, modelAvailable: false, models: [], error: "未配置本机密钥" });
      return send(res, 400, JSON.stringify({ error: "没有找到这个平台的本机密钥" }));
    }
    try {
      const response = await networkFetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        if (body.quiet) return sendJson(res, {
          ok: false,
          available: false,
          modelAvailable: false,
          models: [],
          error: `连接失败（HTTP ${response.status}）`
        });
        return send(res, 502, JSON.stringify({ error: `连接失败（HTTP ${response.status}）` }));
      }
      const data = await response.json();
      const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean).slice(0, 50) : [];
      return sendJson(res, { ok: true, available: true, modelAvailable: !models.length || models.includes(config.model), models });
    } catch (error) {
      if (body.quiet) return sendJson(res, {
        ok: false,
        available: false,
        modelAvailable: false,
        models: [],
        error: String(error?.message || "连接失败").slice(0, 300)
      });
      return send(res, 502, JSON.stringify({ error: String(error?.message || "连接失败").slice(0, 300) }));
    }
  }

  if (pathname === "/api/text-api/test" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 64_000) || "{}");
    const config = normalizeTextApiConfig(body);
    const apiKey = textApiCredential(config.provider, body.apiKey);
    if (!apiKey) {
      if (body.quiet) return sendJson(res, { ok: false, available: false, modelAvailable: false, models: [], error: "未配置本机文案密钥" });
      return send(res, 400, JSON.stringify({ error: "没有找到这个文案平台的本机密钥" }));
    }
    try {
      const response = await networkFetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        if (body.quiet) return sendJson(res, {
          ok: false,
          available: false,
          modelAvailable: false,
          models: [],
          error: `连接失败（HTTP ${response.status}）`
        });
        return send(res, 502, JSON.stringify({ error: `连接失败（HTTP ${response.status}）` }));
      }
      const data = await response.json();
      const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean).slice(0, 50) : [];
      return sendJson(res, { ok: true, available: true, modelAvailable: !models.length || models.includes(config.model), models });
    } catch (error) {
      if (body.quiet) return sendJson(res, {
        ok: false,
        available: false,
        modelAvailable: false,
        models: [],
        error: String(error?.message || "连接失败").slice(0, 300)
      });
      return send(res, 502, JSON.stringify({ error: String(error?.message || "连接失败").slice(0, 300) }));
    }
  }

  if (pathname === "/api/image-api/generate" && req.method === "POST") {
    const body = JSON.parse(await getBody(req, 256_000) || "{}");
    const config = normalizeImageApiConfig(body);
    const apiKey = imageApiCredential(config.provider, body.apiKey);
    const materialPath = path.resolve(String(body.materialPath || ""));
    const templatePath = path.resolve(String(body.templatePath || ""));
    if (!body.confirmed) return send(res, 409, JSON.stringify({ error: "请先确认出图计划，再开始校准" }));
    if (!isAllowedFile(materialPath) || !exists(materialPath)) return send(res, 400, JSON.stringify({ error: "请选择真实存在的素材文件夹" }));
    if (!isAllowedFile(templatePath) || !exists(templatePath)) return send(res, 400, JSON.stringify({ error: "请选择真实存在的模板文件夹" }));
    const stage = body.stage === "inner" ? "inner" : "cover";
    const templateImages = collectReferenceImages(templatePath, stage === "cover" ? 1 : 2);
    const materialImages = collectReferenceImages(materialPath, 6);
    if (!templateImages.length || !materialImages.length) return send(res, 400, JSON.stringify({ error: "模板或素材文件夹中没有可用图片" }));
    const facts = materialFacts(materialPath);
    const prompt = buildProductionPrompt({ ...body, stage }, facts);
    const folderName = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${safeOutputName(path.basename(materialPath))}_${safeOutputName(path.basename(templatePath))}`;
    const outputRoot = path.join(IMAGE_REVIEW_ROOT, folderName, stage === "cover" ? "封面校准" : "内页校准");
    let results;
    try {
      results = await generateImages({
        config, apiKey, prompt,
        referencePaths: [...templateImages, ...materialImages].slice(0, 8),
        outputRoot, count: body.count
      });
    } catch (error) {
      const timedOut = error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" || /timeout|timed out/i.test(String(error?.message || ""));
      const message = timedOut
        ? "生图平台连接超时，系统已经自动重试；请稍后再次开始，当前素材和模板选择不会丢失。"
        : String(error?.message || "生图失败，请稍后重试");
      return send(res, 502, JSON.stringify({ error: message }));
    }
    const report = {
      status: "review-ready",
      createdAt: new Date().toISOString(),
      stage,
      materialPath,
      templatePath,
      provider: config.provider,
      model: config.model,
      requestedCount: Number(body.count) || 1,
      rules: { templateClass: "A", materialClass: "B", historicalResultsClass: "C", officialLibraryWritten: false },
      results
    };
    fs.mkdirSync(outputRoot, { recursive: true });
    writeJson(path.join(outputRoot, "生成记录.json"), report);
    return sendJson(res, {
      ok: true,
      status: report.status,
      outputRoot,
      results: results.map((item) => ({ ...item, previewUrl: `/file?path=${encodeURIComponent(item.outputFile)}` }))
    });
  }

  return false;
}

module.exports = { handle };
