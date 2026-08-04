(function initTeambuildingGptAutomationCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeambuildingGptAutomationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function parsePlannedImageCount(text) {
    const source = String(text || "");
    // GPT does not use one fixed label. Real plans commonly say
    // “本轮输出页数：10 页”, “建议输出：9 页”, “预计输出总张数：9 张”
    // or only enumerate P1/P2/... headings. Keep the match local to a page/
    // image-count label so prices, people counts and route durations cannot
    // become the page total by accident.
    const explicit = [
      /(?:本轮|本次|本批)?\s*(?:预计|建议)?\s*(?:输出|生成|制作)?\s*(?:总)?(?:页数|张数|图片数|图片数量)\s*[：:＝=]?\s*(\d{1,2})\s*(?:张|页|张图|张图片)?/giu,
      /(?:建议|预计|本轮|本次|本批)?\s*(?:输出|生成|制作)\s*[：:＝=]\s*(\d{1,2})\s*(?:张|页|张图|张图片)/giu,
      /(?:预计输出(?:总)?(?:张数|页数)|输出总张数|共计|合计|总计|固定)\s*[：:＝=]?\s*(?:\D{0,40})?(\d{1,2})\s*(?:张|页)/giu
    ].flatMap((pattern) => [...source.matchAll(pattern)])
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 30);
    if (explicit.length) return explicit[explicit.length - 1];
    const pages = [...source.matchAll(/^\s*P\s*(\d{1,2})(?=\s*(?:[｜|：:\-—.．]|\b|$))/gim)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value <= 30);
    return pages.length ? Math.max(...pages) : 0;
  }

  function uniqueGeneratedImageUrls(urls) {
    const seen = new Set();
    return (Array.isArray(urls) ? urls : []).map((value) => String(value || "").trim()).filter((url) => {
      if (!/^(?:https?:|blob:|data:image\/)/i.test(url)) return false;
      // ChatGPT may render one generated file through several signed URLs
      // (thumbnail/full-size/lazy-loaded variants).  The backend file id is
      // the stable identity; comparing the entire signed URL made one image
      // count as two or three pages and was the source of false low-output
      // limit detections.
      let identity = url;
      try {
        const parsed = new URL(url);
        const fileId = parsed.searchParams.get("id");
        if (fileId) identity = `chatgpt-file:${fileId}`;
      } catch { /* blob/data URLs keep their full identity */ }
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function isCompleteCopy(text, minimum = 300) {
    return String(text || "").replace(/\s/g, "").length >= Math.max(1, Number(minimum || 300));
  }

  function isLikelyPublishCopy(text, minimum = 300) {
    const source = String(text || "").trim();
    if (!isCompleteCopy(source, minimum)) return false;
    if (/母版页数不是输出上限|逐页迁移计划|迁移计划|等待.{0,12}(?:回复|输入).{0,6}1|暂时不出图/i.test(source)) return false;
    const pageHeadings = source.match(/(?:^|\n)\s*P\s*\d{1,2}\s*[｜|：:\-—]/gim) || [];
    if (pageHeadings.length >= 2) return false;
    return /#[^\s#]{2,}|(?:适合|地点|行程|玩法|团建|公司团队|出发前)/i.test(source);
  }

  return { parsePlannedImageCount, uniqueGeneratedImageUrls, isCompleteCopy, isLikelyPublishCopy };
});
