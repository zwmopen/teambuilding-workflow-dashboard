const path = require("node:path");

const RECIPES = [
  {
    id: "rice-grid-quotes",
    match: /米字格|黄底引号|手写标题/,
    name: "米字格封面＋黄底引号四宫格",
    cover: "米字格大字四宫格封面：2×2无白边实景拼图，中部米白米字格独立汉字卡，黑色毛笔感大字，红色细米字线，下方粉色不规则横条。",
    inner: "黄底引号无缝四宫格内页：2×2无白边拼图，黄色标题条压在中缝，黑色圆润手写字，蓝色左引号与绿色右引号。",
    titleStyle: "封面严格复刻米字格字卡；内页使用圆润手写标题，禁止促销黑体。"
  },
  {
    id: "green-info-keycaps",
    match: /湖景绿底|绿底.*键帽|彩色键帽/,
    name: "湖景绿底信息封面＋彩色键帽四宫格",
    cover: "湖景或营地大图主视觉，下半部深绿色半透明信息区，白色重标题，简洁信息分区；有明确价格才保留价格，没有则改成玩法、时长和人数。",
    inner: "无白边四宫格，中央交界处为彩色圆角键帽逐字标题，左侧黑色花形符号键帽。",
    titleStyle: "保留彩色键帽识别度，但减少儿童化和廉价感。"
  },
  {
    id: "forest-route-seam-title",
    match: /森林漂流|路线节点|黑描边景点|中缝标题/,
    name: "森林路线节点封面＋中缝标题四宫格",
    cover: "森林或山野实拍背景，黄白双色超大标题，黑描边，白色虚线路线连接定位节点；不是信息卡海报。",
    inner: "3:4无白边四宫格，分区弱分隔，白色中等偏轻标题加细黑描边，标题压在横向中缝附近。",
    titleStyle: "禁止又厚又硬的广告字；中文准确，字号克制。"
  },
  {
    id: "memo-handwriting",
    match: /备忘录|手写大字|便签/,
    name: "备忘录手写封面＋原生拼图内页",
    cover: "真实场景主图叠加备忘录或便签式手写大字，保持原母版的字号、留白、色块和标题位置。",
    inner: "沿用母版典型内页的拼图比例、手写标题和色块关系。",
    titleStyle: "手写气质优先，不使用标准广告黑体。"
  }
];

const DEFAULT_RECIPE = {
  id: "strict-template-transfer",
  name: "严格母版迁移",
  cover: "逐项复刻所选模板首张封面的构图、字体气质、字号、配色、标题位置、装饰和留白。",
  inner: "逐项复刻所选模板典型内页的拼图结构、标题位置、字体、配色和页面节奏。",
  titleStyle: "不得重新设计，不得把素材原排版当成模板。"
};

const TOPIC_WORDS = [
  "漂流", "溯溪", "露营", "烧烤", "徒步", "采茶", "制茶", "点茶", "拓染", "采摘",
  "垂钓", "越野", "皮划艇", "篝火", "草坪", "温泉", "轰趴", "会议", "农家菜", "古村",
  "乐园", "溶洞", "团建", "一日", "两天一夜"
];

function recipeForTemplate(templateName = "") {
  return RECIPES.find((recipe) => recipe.match.test(String(templateName))) || DEFAULT_RECIPE;
}

function cleanTitle(value) {
  const cleaned = String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/^[\d\s._\-（）()【】[\]]+/, "")
    .replace(/[@#].*$/, "")
    .replace(/[|｜].*$/, "")
    .replace(/[^\p{L}\p{N}\s·＋+&]/gu, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(HR|行政)(快|请)?(收藏|码住)/i, "")
    .replace(/(超好玩|快收藏|必看|码住|一键解锁|无限尝鲜)/g, "")
    .trim();
  return cleaned.slice(0, 16);
}

function factTitles(facts = "") {
  const lines = String(facts).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const found = [];
  for (const line of lines) {
    const compact = cleanTitle(line.replace(/^[#>*\d.\-、\s]+/, "").replace(/[：:].*$/, ""));
    if (compact.length >= 2 && compact.length <= 16 && TOPIC_WORDS.some((word) => compact.includes(word))) {
      found.push(compact);
    }
  }
  return [...new Set(found)];
}

function buildProductionPlan({
  mode = "set",
  materialPath,
  templatePath,
  materialImages = [],
  facts = "",
  requestedPages,
  batchIndex = 0
}) {
  const materialName = cleanTitle(path.basename(materialPath)) || `素材${batchIndex + 1}`;
  const templateName = cleanTitle(path.basename(templatePath)) || "当前模板";
  const recipe = recipeForTemplate(templateName);
  const imageTitles = materialImages.map((file) => cleanTitle(path.basename(file))).filter((title) => title && !/^(img|image|dsc|微信图片|p\d+)$/i.test(title));
  const titles = [...factTitles(facts), ...imageTitles];
  const automaticPages = Math.max(1, Math.min(10, materialImages.length || 1));
  const pageCount = mode === "one"
    ? 1
    : Math.max(1, Math.min(10, Number(requestedPages) || automaticPages));
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const role = index === 0 ? "cover" : "inner";
    const sourceImage = materialImages[Math.min(index, Math.max(0, materialImages.length - 1))] || "";
    const title = index === 0 ? materialName : (titles[index - 1] || `项目亮点 ${index}`);
    return {
      index: index + 1,
      code: `P${index + 1}`,
      role,
      roleLabel: role === "cover" ? "封面" : "内页",
      title,
      sourceImage,
      rule: role === "cover" ? recipe.cover : recipe.inner
    };
  });
  return {
    mode,
    materialPath,
    materialName,
    templatePath,
    templateName,
    recipe: { id: recipe.id, name: recipe.name, cover: recipe.cover, inner: recipe.inner, titleStyle: recipe.titleStyle },
    pageCount,
    pages,
    output: mode === "one" ? "1张独立3:4待审图片" : `${pageCount}张独立3:4图片＋1份小红书文案＋1份生产记录`,
    safeguards: [
      "A类模板只决定视觉；B类素材只决定事实和内容；历史失败图不参与设计",
      "页数由有效素材决定，不按母版页数硬凑，不把多页合成一张",
      "江浙沪企业团建、10人起接；没有明确价格不写价格",
      "禁止虚构地点、项目、车程、价格、建筑和素材中不存在的场景",
      "结果先进入待审区，人工通过后才进入正式成品库"
    ]
  };
}

function buildPagePrompt(plan, page, facts = "", extraPrompt = "", quality = "严格母版") {
  return [
    "执行已经确认的本地团建图文生产任务。不是自由设计，也不是做相似风格。",
    `模板生产配方：${plan.recipe.name}。`,
    `本页：${page.code} ${page.roleLabel}，标题“${page.title}”。`,
    plan.mode === "one"
      ? "这是单张作品，不得沿用母版里的01/09等多页页码；需要页码时只能写01/01，优先不显示页码。"
      : `本套共${plan.pageCount}页；如母版含页码，本页只能显示${String(page.index).padStart(2, "0")}/${String(plan.pageCount).padStart(2, "0")}。`,
    `本页硬规则：${page.rule}`,
    `文字规则：${plan.recipe.titleStyle}`,
    "第一组参考图是A类永久视觉母版；最后一张参考图是本页B类内容素材。只替换内容，不改变母版骨架。",
    "每次只输出一张独立3:4成品图。禁止多页合集、长图、缩略图墙、手机样机和白色画布展示。",
    "业务规则：江浙沪企业团建，10人起接。素材没有明确价格时不得出现任何价格。",
    "事实锁：不得虚构地点、项目、车程、价格、建筑、人物活动和素材中不存在的露营或篝火。",
    "人物、分区、静物和道具必须去重；保持真实手机抓拍感，不要广告模特、塑料脸和统一假笑。",
    `质量档：${quality}。`,
    extraPrompt ? `本批补充要求：${String(extraPrompt).slice(0, 12000)}` : "",
    facts ? `素材事实（只能从这里取业务事实）：\n${String(facts).slice(0, 12000)}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildCopyPrompt(plan, facts = "") {
  return [
    "请为下面这套团建轮播生成一份可直接发布的小红书文案，只输出文案正文。",
    `主题：${plan.materialName}`,
    `页面：${plan.pages.map((page) => page.title).join("、")}`,
    "使用自然口语，不要像旅行社广告；开头给2个可选标题，正文有清晰路线或体验逻辑，结尾给8—12个相关标签。",
    "业务口径为江浙沪企业团建、10人起接。没有素材依据不要写价格、固定车程、固定套餐、必然结果或资质背书。",
    "禁止出现：私信、加微信、评论区领取、免费定制、咨询、报价、预约、下单、全包、一站式。",
    facts ? `素材事实：\n${String(facts).slice(0, 12000)}` : ""
  ].filter(Boolean).join("\n\n");
}

function applySuggestedTitles(plan, suggestion = {}) {
  const workTitle = cleanTitle(suggestion.workTitle) || plan.materialName;
  const suggestedPages = Array.isArray(suggestion.pages) ? suggestion.pages : [];
  return {
    ...plan,
    materialName: workTitle,
    pages: plan.pages.map((page, index) => ({
      ...page,
      title: index === 0
        ? workTitle
        : (cleanTitle(suggestedPages[index]?.title || suggestedPages[index - 1]?.title) || page.title)
    }))
  };
}

module.exports = {
  DEFAULT_RECIPE,
  RECIPES,
  applySuggestedTitles,
  buildCopyPrompt,
  buildPagePrompt,
  buildProductionPlan,
  recipeForTemplate
};
