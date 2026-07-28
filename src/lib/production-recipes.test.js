const test = require("node:test");
const assert = require("node:assert/strict");
const { applySuggestedTitles, buildProductionPlan, recipeForTemplate } = require("./production-recipes");

test("chat-derived template recipes identify the three long-term master styles", () => {
  assert.equal(recipeForTemplate("米字格大字四宫格封面 × 黄底引号手写标题").id, "rice-grid-quotes");
  assert.equal(recipeForTemplate("湖景绿底价格信息封面 × 彩色键帽大字四宫格").id, "green-info-keycaps");
  assert.equal(recipeForTemplate("森林漂流路线节点封面 × 无白边四宫格黑描边").id, "forest-route-seam-title");
});

test("one, set and material-driven page counts are explicit", () => {
  const common = {
    materialPath: "D:\\素材\\杭州径山团建",
    templatePath: "D:\\模板\\森林漂流路线节点封面",
    materialImages: ["1.jpg", "2_茶山采茶.jpg", "3_点茶.jpg"],
    facts: "茶山采茶\n七汤点茶"
  };
  assert.equal(buildProductionPlan({ ...common, mode: "one" }).pageCount, 1);
  const set = buildProductionPlan({ ...common, mode: "set" });
  assert.equal(set.pageCount, 3);
  assert.equal(set.pages[0].role, "cover");
  assert.equal(set.pages[1].role, "inner");
  assert.match(set.output, /文案/);
});

test("text planning suggestions are cleaned before appearing in the user plan", () => {
  const plan = buildProductionPlan({
    mode: "set",
    materialPath: "D:\\素材\\1__杭州径山团建@HR快收藏",
    templatePath: "D:\\模板\\森林路线节点",
    materialImages: ["1.jpg", "2.jpg"]
  });
  const refined = applySuggestedTitles(plan, {
    workTitle: "杭州径山团建🔥",
    pages: [{ title: "杭州径山团建" }, { title: "茶山采茶✨" }]
  });
  assert.equal(refined.materialName, "杭州径山团建");
  assert.equal(refined.pages[1].title, "茶山采茶");
});
