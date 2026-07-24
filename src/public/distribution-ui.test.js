const assert = require("node:assert/strict");
const test = require("node:test");

const {
  filterCollections,
  parseDeviceCheckOutput,
  platformStateLabel
} = require("./distribution-ui");

const collections = [
  {
    name: "作品集_015[泛]",
    type: "traffic",
    xhs: "available",
    douyin: "available",
    officialAccount: "available",
    dualPlatformEligible: true
  },
  {
    name: "作品集_027[泛]",
    type: "traffic",
    xhs: "used",
    douyin: "archived",
    officialAccount: "available",
    dualPlatformEligible: false
  },
  {
    name: "作品集_045[转]",
    type: "conversion",
    xhs: "used",
    douyin: "used",
    officialAccount: "reserved_pending_upload",
    dualPlatformEligible: false
  }
];

test("filterCollections combines type, platform and text filters", () => {
  assert.deepEqual(
    filterCollections(collections, {
      type: "traffic",
      platform: "dual",
      query: "015"
    }).map((item) => item.name),
    ["作品集_015[泛]"]
  );
  assert.deepEqual(
    filterCollections(collections, {
      type: "all",
      platform: "official_pending",
      query: ""
    }).map((item) => item.name),
    ["作品集_045[转]"]
  );
});

test("platformStateLabel uses user-facing labels without overstating publication", () => {
  assert.equal(platformStateLabel("available"), "可用");
  assert.equal(platformStateLabel("reserved_pending_upload"), "已领取待上传");
  assert.equal(platformStateLabel("confirmed_published"), "已确认上传");
  assert.equal(platformStateLabel("invalid"), "入口异常");
});

test("parseDeviceCheckOutput reads registered and online counts from the skill output", () => {
  assert.deepEqual(
    parseDeviceCheckOutput("团建项目已登记手机 8 台；当前在线 1 台。\n提醒：5号需要补货"),
    { registered: 8, online: 1 }
  );
  assert.deepEqual(parseDeviceCheckOutput("设备发现失败"), { registered: null, online: null });
});
