const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  materialCategoryCountMap,
  materialCategoryIndex,
  materialTreeSignature,
  scanPostFolders
} = require("./server");

test("scanPostFolders recursively finds folders containing images and text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "material-scan-"));
  try {
    const post = path.join(root, "夏季团建", "安吉", "帖子A");
    const imagesOnly = path.join(root, "夏季团建", "只有图片");
    fs.mkdirSync(post, { recursive: true });
    fs.mkdirSync(imagesOnly, { recursive: true });
    fs.writeFileSync(path.join(post, "01.jpg"), "image");
    fs.writeFileSync(path.join(post, "文案.txt"), "copy");
    fs.writeFileSync(path.join(imagesOnly, "01.jpg"), "image");

    const result = scanPostFolders(root);
    assert.deepEqual(result.map((item) => item.path), [post]);
    assert.equal(result[0].imageCount, 1);
    assert.equal(result[0].textCount, 1);
    assert.equal(result[0].relativeDepth, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("materialTreeSignature changes when a top-level material category is renamed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "material-signature-"));
  try {
    const oldCategory = path.join(root, "信息流素材（高转化）");
    const newCategory = path.join(root, "转化素材-信息流素材（高转化）");
    fs.mkdirSync(oldCategory, { recursive: true });
    const before = materialTreeSignature(root);
    fs.renameSync(oldCategory, newCategory);
    const after = materialTreeSignature(root);
    assert.notEqual(after, before);
    assert.match(after, /转化素材-信息流素材/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("material category index stays shallow so opening the workbench does not scan every post", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "material-lazy-index-"));
  try {
    const first = path.join(root, "素材甲", "帖子一");
    const second = path.join(root, "素材乙", "帖子二");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(first, "封面.png"), "image");
    fs.writeFileSync(path.join(first, "文案.txt"), "copy");
    fs.writeFileSync(path.join(second, "封面.png"), "image");
    fs.writeFileSync(path.join(second, "文案.txt"), "copy");

    const categories = materialCategoryIndex(root);
    assert.deepEqual(categories.map((item) => item.name), ["素材甲", "素材乙"]);
    assert.deepEqual(scanPostFolders(categories[0].path).map((item) => item.name), ["帖子一"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("saved global index supplies real parent-folder counts without rescanning every post", () => {
  const root = path.resolve("D:\\素材库");
  const first = path.join(root, "精准流量贴");
  const second = path.join(root, "泛流量贴");
  const counts = materialCategoryCountMap(root, {
    root,
    categories: [
      { path: first, count: 31 },
      { path: second, count: 18 },
      { path: path.join(root, "损坏数据"), count: -1 }
    ]
  });

  assert.equal(counts.get(path.resolve(first)), 31);
  assert.equal(counts.get(path.resolve(second)), 18);
  assert.equal(counts.has(path.resolve(root, "损坏数据")), false);
  assert.equal(materialCategoryCountMap("D:\\另一个素材库", {
    root,
    categories: [{ path: first, count: 31 }]
  }).size, 0);
});
