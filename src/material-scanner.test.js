const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { scanPostFolders } = require("./server");

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
