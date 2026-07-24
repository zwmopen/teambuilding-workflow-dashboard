const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveInitialTab,
  buildMaterialTree,
  buildChatGptInstruction
} = require("./material-workspace");

test("旧版总览状态会迁移到素材生产", () => {
  assert.equal(resolveInitialTab("overview"), "dashboard");
  assert.equal(resolveInitialTab("products"), "products");
  assert.equal(resolveInitialTab(""), "dashboard");
});

test("素材分类会转换为可展开的本地文件树", () => {
  const categories = [{
    name: "夏季团建",
    path: "D:\\素材\\夏季团建",
    count: 2,
    items: [
      { id: "a", name: "安吉两天一夜", path: "D:\\素材\\夏季团建\\安吉两天一夜", imageCount: 9 },
      { id: "b", name: "杭州周边团建", path: "D:\\素材\\夏季团建\\杭州周边团建", imageCount: 7 }
    ]
  }];

  const tree = buildMaterialTree(categories, "b", ["D:\\素材\\夏季团建"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].expanded, true);
  assert.equal(tree[0].items.length, 2);
  assert.equal(tree[0].items[1].selected, true);
  assert.equal(tree[0].items[1].imageCount, 7);
});

test("传 GPT 指令包含帖子文件夹路径和真实操作边界", () => {
  const instruction = buildChatGptInstruction(
    { name: "安吉两天一夜", path: "D:\\素材\\安吉两天一夜", imageCount: 9 },
    { name: "夏季团建" },
    "T04"
  );

  assert.match(instruction, /安吉两天一夜/);
  assert.match(instruction, /D:\\素材\\安吉两天一夜/);
  assert.match(instruction, /T04/);
  assert.match(instruction, /本地文件夹/);
});
