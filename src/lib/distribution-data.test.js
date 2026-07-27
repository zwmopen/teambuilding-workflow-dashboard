const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  classifyCollectionName,
  confirmOfficialUpload,
  getDistributionSnapshot,
  markOfficialUsed,
  moveCollectionSourceToStage
} = require("./distribution-data");

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "distribution-data-"));
  const collectionsRoot = path.join(root, "collections");
  const publishRoot = path.join(root, "发布空间");
  ["小红书", "抖音", "公众号", "已使用", path.join("归档", "抖音")].forEach((name) => {
    fs.mkdirSync(path.join(publishRoot, name), { recursive: true });
  });
  fs.mkdirSync(collectionsRoot, { recursive: true });
  return { root, collectionsRoot, publishRoot };
}

function createCollection(collectionsRoot, name, itemCount = 14) {
  const source = path.join(collectionsRoot, name);
  fs.mkdirSync(source, { recursive: true });
  for (let index = 1; index <= itemCount; index += 1) {
    fs.mkdirSync(path.join(source, String(index).padStart(2, "0")));
  }
  return source;
}

function linkCollection(publishRoot, platform, name, source) {
  const target = path.join(publishRoot, platform, name);
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  return target;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("classifyCollectionName recognizes distribution labels and hidden entries", () => {
  assert.deepEqual(classifyCollectionName("作品集_015[泛]"), {
    type: "traffic",
    typeLabel: "游戏/泛流量",
    hidden: false,
    labelled: true
  });
  assert.equal(classifyCollectionName("作品集_038[转]").type, "conversion");
  assert.equal(classifyCollectionName("作品集_046").type, "unclassified");
  assert.equal(classifyCollectionName(".作品集_041[转]").hidden, true);
});

test("snapshot reads labelled and unclassified collections directly from the selected library", () => {
  const fixture = makeFixture();
  try {
    createCollection(fixture.collectionsRoot, "作品集_015[泛]");
    createCollection(fixture.collectionsRoot, "作品集_038[转]");
    createCollection(fixture.collectionsRoot, "作品集_046");
    fs.mkdirSync(path.join(fixture.collectionsRoot, "临时散图"), { recursive: true });

    const snapshot = getDistributionSnapshot({
      publishRoot: fixture.publishRoot,
      libraryRoot: fixture.collectionsRoot
    });

    assert.deepEqual(snapshot.collections.map((item) => item.name), [
      "作品集_015[泛]",
      "作品集_038[转]",
      "作品集_046"
    ]);
    assert.equal(snapshot.collections[0].type, "traffic");
    assert.equal(snapshot.collections[1].type, "conversion");
    assert.equal(snapshot.collections[2].type, "unclassified");
    assert.equal(snapshot.collections[2].itemCount, 14);
    assert.equal(snapshot.collections[2].workflowStage, "mobile");
  } finally {
    cleanup(fixture.root);
  }
});

test("snapshot only marks same-source valid junctions as dual-platform eligible", () => {
  const fixture = makeFixture();
  try {
    const sourceA = createCollection(fixture.collectionsRoot, "作品集_015[泛]");
    const sourceB = createCollection(fixture.collectionsRoot, "作品集_038[转]");
    linkCollection(fixture.publishRoot, "小红书", "作品集_015[泛]", sourceA);
    linkCollection(fixture.publishRoot, "抖音", "作品集_015[泛]", sourceA);
    linkCollection(fixture.publishRoot, "公众号", "作品集_015[泛]", sourceA);
    linkCollection(fixture.publishRoot, "小红书", "作品集_038[转]", sourceB);
    linkCollection(fixture.publishRoot, "抖音", "作品集_038[转]", sourceA);

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const traffic = snapshot.collections.find((item) => item.name === "作品集_015[泛]");
    const conversion = snapshot.collections.find((item) => item.name === "作品集_038[转]");

    assert.equal(traffic.itemCount, 14);
    assert.equal(traffic.xhs, "available");
    assert.equal(traffic.douyin, "available");
    assert.equal(traffic.officialAccount, "available");
    assert.equal(traffic.dualPlatformEligible, true);
    assert.equal(conversion.dualPlatformEligible, false);
    assert.match(conversion.exclusionReasons.join("；"), /目标不一致/);
    assert.equal(snapshot.summary.dualPlatformAvailable, 1);
  } finally {
    cleanup(fixture.root);
  }
});

test("device usage log overrides accidentally recreated platform links", () => {
  const fixture = makeFixture();
  try {
    const source = createCollection(fixture.collectionsRoot, "作品集_015[泛]");
    linkCollection(fixture.publishRoot, "小红书", "作品集_015[泛]", source);
    linkCollection(fixture.publishRoot, "抖音", "作品集_015[泛]", source);
    fs.writeFileSync(
      path.join(fixture.publishRoot, "device-usage-log.csv"),
      [
        "时间,设备名,设备型号,源作品集,源路径,文件数,字节数,传输协议,接收确认,操作",
        `2026-07-25T10:00:00,1号,Android,作品集_015[泛],${source},14,100,LAN,作品数 0→14,删除小红书+抖音 Junction`
      ].join("\n"),
      "utf8"
    );

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const collection = snapshot.collections.find((item) => item.name === "作品集_015[泛]");

    assert.equal(collection.xhs, "used");
    assert.equal(collection.douyin, "used");
    assert.equal(collection.automaticEligible, false);
    assert.match(collection.exclusionReasons.join("；"), /已有手机分发记录/);
  } finally {
    cleanup(fixture.root);
  }
});

test("snapshot combines archive and latest official-account log state", () => {
  const fixture = makeFixture();
  try {
    const source = createCollection(fixture.collectionsRoot, "作品集_027[泛]");
    linkCollection(fixture.publishRoot, path.join("归档", "抖音"), "作品集_027[泛]", source);
    fs.writeFileSync(
      path.join(fixture.publishRoot, "official-account-usage-log.csv"),
      [
        "时间,公众号账号,承载设备,作品集,源路径,文件数,字节数,小红书抖音连接剩余数,状态,操作",
        `2026-07-24T10:00:00,测试账号,2号,作品集_027[泛],${source},14,100,0,已领取待电脑上传,删除公众号 Junction`,
        `2026-07-24T11:00:00,测试账号,2号,作品集_027[泛],${source},14,100,0,公众号已使用,人工确认上传完成`
      ].join("\n"),
      "utf8"
    );

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const collection = snapshot.collections.find((item) => item.name === "作品集_027[泛]");

    assert.equal(collection.douyin, "archived");
    assert.equal(collection.officialAccount, "confirmed_published");
    assert.equal(collection.officialAccountHistoryCount, 2);
    assert.equal(snapshot.summary.douyinArchived, 1);
    assert.equal(snapshot.summary.officialConfirmed, 1);
  } finally {
    cleanup(fixture.root);
  }
});

test("dot-prefixed labelled collections stay eligible while unlabelled and broken entries do not", () => {
  const fixture = makeFixture();
  try {
    const hidden = createCollection(fixture.collectionsRoot, ".作品集_041[转]");
    const unlabelled = createCollection(fixture.collectionsRoot, "作品集_046");
    linkCollection(fixture.publishRoot, "小红书", ".作品集_041[转]", hidden);
    linkCollection(fixture.publishRoot, "抖音", ".作品集_041[转]", hidden);
    linkCollection(fixture.publishRoot, "小红书", "作品集_046", unlabelled);
    fs.symlinkSync(
      path.join(fixture.collectionsRoot, "不存在"),
      path.join(fixture.publishRoot, "抖音", "作品集_099[泛]"),
      process.platform === "win32" ? "junction" : "dir"
    );

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const hiddenItem = snapshot.collections.find((item) => item.name === ".作品集_041[转]");
    const unlabelledItem = snapshot.collections.find((item) => item.name === "作品集_046");
    const brokenItem = snapshot.collections.find((item) => item.name === "作品集_099[泛]");

    assert.equal(hiddenItem.automaticEligible, true);
    assert.equal(hiddenItem.dualPlatformEligible, true);
    assert.equal(unlabelledItem.automaticEligible, false);
    assert.equal(brokenItem.automaticEligible, false);
    assert.equal(snapshot.summary.automaticEligible, 1);
    assert.equal(snapshot.summary.conversion, 1);
  } finally {
    cleanup(fixture.root);
  }
});

test("broken archive junctions are counted but clearly marked invalid", () => {
  const fixture = makeFixture();
  try {
    fs.symlinkSync(
      path.join(fixture.collectionsRoot, "已删除源作品集"),
      path.join(fixture.publishRoot, "归档", "抖音", "作品集_027[泛]"),
      process.platform === "win32" ? "junction" : "dir"
    );

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const collection = snapshot.collections.find((item) => item.name === "作品集_027[泛]");

    assert.equal(collection.douyin, "invalid");
    assert.equal(snapshot.summary.douyinArchived, 1);
    assert.equal(snapshot.summary.douyinArchiveInvalid, 1);
  } finally {
    cleanup(fixture.root);
  }
});

test("confirmOfficialUpload appends an auditable state transition only from pending", () => {
  const fixture = makeFixture();
  try {
    const source = createCollection(fixture.collectionsRoot, "作品集_045[转]");
    const logFile = path.join(fixture.publishRoot, "official-account-usage-log.csv");
    fs.writeFileSync(
      logFile,
      [
        "时间,公众号账号,承载设备,作品集,源路径,文件数,字节数,小红书抖音连接剩余数,状态,操作",
        `2026-07-24T10:00:00,测试账号,2号,作品集_045[转],${source},14,100,0,已领取待电脑上传,删除公众号 Junction`
      ].join("\n"),
      "utf8"
    );

    confirmOfficialUpload({
      publishRoot: fixture.publishRoot,
      collection: "作品集_045[转]",
      now: "2026-07-24T12:00:00"
    });
    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const collection = snapshot.collections.find((item) => item.name === "作品集_045[转]");

    assert.equal(collection.officialAccount, "confirmed_published");
    assert.equal(collection.officialAccountHistoryCount, 2);
    assert.equal(collection.sourceValid, true);
    assert.equal(collection.itemCount, 14);
    assert.equal(collection.automaticEligible, false);
    assert.throws(() => confirmOfficialUpload({
      publishRoot: fixture.publishRoot,
      collection: "作品集_045[转]",
      now: "2026-07-24T13:00:00"
    }), /不是待上传状态/);
  } finally {
    cleanup(fixture.root);
  }
});

test("physical stage folders are the workflow source of truth in both directions", () => {
  const fixture = makeFixture();
  try {
    const source = createCollection(fixture.collectionsRoot, "作品集_050[泛]");
    linkCollection(fixture.publishRoot, "小红书", "作品集_050[泛]", source);
    linkCollection(fixture.publishRoot, "抖音", "作品集_050[泛]", source);
    linkCollection(fixture.publishRoot, "公众号", "作品集_050[泛]", source);
    let item = getDistributionSnapshot({ publishRoot: fixture.publishRoot, libraryRoot: fixture.collectionsRoot })
      .collections.find((entry) => entry.name === "作品集_050[泛]");
    assert.equal(item.workflowStage, "mobile");

    fs.unlinkSync(path.join(fixture.publishRoot, "小红书", "作品集_050[泛]"));
    fs.unlinkSync(path.join(fixture.publishRoot, "抖音", "作品集_050[泛]"));
    item = getDistributionSnapshot({ publishRoot: fixture.publishRoot, libraryRoot: fixture.collectionsRoot })
      .collections.find((entry) => entry.name === "作品集_050[泛]");
    assert.equal(item.workflowStage, "official");

    markOfficialUsed({
      publishRoot: fixture.publishRoot,
      libraryRoot: fixture.collectionsRoot,
      collection: "作品集_050[泛]",
      now: "2026-07-27T20:00:00"
    });
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.existsSync(path.join(fixture.publishRoot, "已使用", "作品集_050[泛]")), true);
    item = getDistributionSnapshot({ publishRoot: fixture.publishRoot, libraryRoot: fixture.collectionsRoot })
      .collections.find((entry) => entry.name === "作品集_050[泛]");
    assert.equal(item.workflowStage, "used");
  } finally {
    cleanup(fixture.root);
  }
});

test("successful phone stage move replaces the official link with the original folder", () => {
  const fixture = makeFixture();
  try {
    const source = createCollection(fixture.collectionsRoot, "作品集_051[转]");
    linkCollection(fixture.publishRoot, "公众号", "作品集_051[转]", source);
    const result = moveCollectionSourceToStage({
      publishRoot: fixture.publishRoot,
      libraryRoot: fixture.collectionsRoot,
      collection: "作品集_051[转]",
      stage: "official"
    });
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.lstatSync(result.targetPath).isSymbolicLink(), false);
    assert.equal(fs.statSync(result.targetPath).isDirectory(), true);
  } finally {
    cleanup(fixture.root);
  }
});

test("dot-prefixed work folders inside a labelled collection still count as works", () => {
  const fixture = makeFixture();
  try {
    const source = path.join(fixture.collectionsRoot, "作品集_045[转]");
    fs.mkdirSync(path.join(source, ".已完成作品A"), { recursive: true });
    fs.writeFileSync(path.join(source, ".已完成作品A", "封面.png"), "image");
    linkCollection(fixture.publishRoot, "公众号", "作品集_045[转]", source);

    const snapshot = getDistributionSnapshot({ publishRoot: fixture.publishRoot });
    const collection = snapshot.collections.find((item) => item.name === "作品集_045[转]");

    assert.equal(collection.sourceValid, true);
    assert.equal(collection.itemCount, 1);
    assert.equal(collection.fileCount, 1);
  } finally {
    cleanup(fixture.root);
  }
});
