const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getDistributionSnapshot } = require("./distribution-data");

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "distribution-scan-validity-"));
  const libraryRoot = path.join(root, "作品集");
  const publishRoot = path.join(root, "发布空间");
  ["小红书", "抖音", "公众号", "已使用", path.join("归档", "抖音")].forEach((name) => {
    fs.mkdirSync(path.join(publishRoot, name), { recursive: true });
  });
  ["抖音小红书", "微信公众号", "已发送"].forEach((name) => {
    fs.mkdirSync(path.join(libraryRoot, name), { recursive: true });
  });
  return { root, libraryRoot, publishRoot };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function collection(snapshot, name) {
  return snapshot.collections.find((item) => item.name === name);
}

test("empty portfolio folders are not treated as distributable collections", () => {
  const fixture = makeFixture();
  try {
    const mobileRoot = path.join(fixture.libraryRoot, "抖音小红书");
    fs.mkdirSync(path.join(mobileRoot, "作品集_080[转]"), { recursive: true });
    fs.mkdirSync(path.join(mobileRoot, "作品集_081[转]", "空作品A"), { recursive: true });
    fs.mkdirSync(path.join(mobileRoot, "作品集_082[转]", "只有文案"), { recursive: true });
    fs.writeFileSync(path.join(mobileRoot, "作品集_082[转]", "只有文案", "小红书文案.txt"), "只有文字，没有图片", "utf8");
    fs.mkdirSync(path.join(mobileRoot, "作品集_083[转]", "完整作品A"), { recursive: true });
    fs.writeFileSync(path.join(mobileRoot, "作品集_083[转]", "完整作品A", "P1.jpg"), "image bytes");

    const snapshot = getDistributionSnapshot({
      publishRoot: fixture.publishRoot,
      libraryRoot: fixture.libraryRoot
    });

    assert.equal(collection(snapshot, "作品集_080[转]").sourceValid, false);
    assert.equal(collection(snapshot, "作品集_081[转]").sourceValid, false);
    assert.equal(collection(snapshot, "作品集_082[转]").sourceValid, false);
    assert.equal(collection(snapshot, "作品集_083[转]").sourceValid, true);
    assert.equal(collection(snapshot, "作品集_080[转]").automaticEligible, false);
    assert.equal(collection(snapshot, "作品集_081[转]").automaticEligible, false);
    assert.equal(collection(snapshot, "作品集_082[转]").automaticEligible, false);
    assert.equal(collection(snapshot, "作品集_083[转]").automaticEligible, true);
    assert.deepEqual(
      snapshot.collections.filter((item) => item.automaticEligible).map((item) => item.name),
      ["作品集_083[转]"]
    );
    assert.equal(snapshot.summary.conversion, 1);
  } finally {
    cleanup(fixture.root);
  }
});

test("portfolio validity is computed from all child folders, not only previewed items", () => {
  const fixture = makeFixture();
  try {
    const source = path.join(fixture.libraryRoot, "抖音小红书", "作品集_084[泛]");
    for (let index = 0; index < 50; index += 1) {
      fs.mkdirSync(path.join(source, `${String(index).padStart(2, "0")}-empty`), { recursive: true });
    }
    fs.mkdirSync(path.join(source, "zz-valid-work"), { recursive: true });
    fs.writeFileSync(path.join(source, "zz-valid-work", "P1.png"), "image bytes");

    const snapshot = getDistributionSnapshot({
      publishRoot: fixture.publishRoot,
      libraryRoot: fixture.libraryRoot
    });
    const item = collection(snapshot, "作品集_084[泛]");

    assert.equal(item.sourceValid, true);
    assert.equal(item.itemCount, 1);
    assert.equal(item.automaticEligible, true);
  } finally {
    cleanup(fixture.root);
  }
});
