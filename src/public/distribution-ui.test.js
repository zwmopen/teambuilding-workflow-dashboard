const assert = require("node:assert/strict");
const test = require("node:test");

const {
  countCollectionFacets,
  countDistributablePackages,
  filterCollections,
  parseDeviceCheckOutput,
  parseDeviceStatusOutput,
  decorateDevices,
  phoneDistributionStats,
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

test("countCollectionFacets returns live cross-filter counts for filter chips", () => {
  assert.deepEqual(
    countCollectionFacets(collections, {
      type: "traffic",
      platform: "all",
      query: ""
    }),
    {
      types: {
        all: 3,
        traffic: 2,
        conversion: 1,
        unclassified: 0
      },
      platforms: {
        all: 2,
        dual: 1,
        xhs: 1,
        official: 2,
        official_pending: 0,
        all_used: 0
      }
    }
  );
});

test("phoneDistributionStats uses the agreed user-facing labels and category counts", () => {
  assert.deepEqual(
    phoneDistributionStats(
      { traffic: 10, conversion: 2 },
      { registered: 8, online: 0 },
      6
    ),
    [
      { id: "devices", label: "当前设备在线", value: "0/8", unit: "台" },
      { id: "traffic", label: "泛流量合集包", value: 10, unit: "个" },
      { id: "conversion", label: "精准流量（业务类）", value: 2, unit: "个" }
    ]
  );
});

test("countDistributablePackages uses the same eligibility as the visible package list", () => {
  assert.deepEqual(
    countDistributablePackages([
      { name: ".作品集_041[转]", type: "conversion", xhs: "available", dualPlatformEligible: false },
      { name: "作品集_008[转]", type: "conversion", xhs: "available", dualPlatformEligible: true },
      { name: "作品集_010[转]", type: "conversion", xhs: "used", dualPlatformEligible: false },
      { name: "作品集_015[泛]", type: "traffic", xhs: "used", dualPlatformEligible: true }
    ]),
    { traffic: 1, conversion: 1 }
  );
});

test("platformStateLabel uses user-facing labels without overstating publication", () => {
  assert.equal(platformStateLabel("available"), "可用");
  assert.equal(platformStateLabel("reserved_pending_upload"), "已打开，待确认上传");
  assert.equal(platformStateLabel("confirmed_published"), "上传已完成");
  assert.equal(platformStateLabel("invalid"), "未登记");
});

test("parseDeviceCheckOutput reads registered and online counts from the skill output", () => {
  assert.deepEqual(
    parseDeviceCheckOutput("团建项目已登记手机 8 台；当前在线 1 台。\n提醒：5号需要补货"),
    { registered: 8, online: 1 }
  );
  assert.deepEqual(parseDeviceCheckOutput("设备发现失败"), { registered: null, online: null });
});

test("parseDeviceStatusOutput identifies concrete online devices and work counts", () => {
  assert.deepEqual(
    parseDeviceStatusOutput([
      "Rmi 9A（A10）（作品数 22）\tXiaomi M2006C3LC\tonline",
      "红米13（微信） 1号（作品数 20）\tXiaomi 23124RN87C\tonline"
    ].join("\n")),
    [
      { name: "Rmi 9A（A10）（作品数 22）", model: "Xiaomi M2006C3LC", online: true, transport: "wifi", workCount: 22 },
      { name: "红米13（微信） 1号（作品数 20）", model: "Xiaomi 23124RN87C", online: true, transport: "wifi", workCount: 20 }
    ]
  );
});

test("decorateDevices puts online devices first and disables offline actions", () => {
  const devices = [
    { id: "iphone-12", number: 2, displayName: "2号 苹果12", models: ["iPhone13,2"], aliases: ["苹果12"] },
    { id: "redmi-13", number: 1, displayName: "1号 红米13", models: ["Xiaomi 23124RN87C"], aliases: ["红米13"] },
    { id: "redmi-9a-a10", number: 8, displayName: "8号 红米9A", models: ["Xiaomi M2006C3LC"], aliases: ["Rmi 9A"] }
  ];
  const online = parseDeviceStatusOutput([
    "Rmi 9A（A10）（作品数 22）\tXiaomi M2006C3LC\tonline",
    "红米13（微信） 1号（作品数 20）\tXiaomi 23124RN87C\tonline"
  ].join("\n"));
  const result = decorateDevices(devices, online);
  assert.deepEqual(result.map((item) => item.number), [1, 8, 2]);
  assert.equal(result[0].online, true);
  assert.deepEqual(result[0].transports, { wifi: true, usb: false, remote: false });
  assert.equal(result[0].workCount, 20);
  assert.equal(result[2].online, false);
});

test("decorateDevices exposes unmatched online phones as blocked unknown devices", () => {
  const result = decorateDevices([
    { id: "known", displayName: "1号手机", aliases: ["1号"], models: ["Model A"], trusted: true }
  ], [
    { name: "临时手机（作品数 2）", model: "Model X", online: true, workCount: 2, current: true }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].trusted, false);
  assert.equal(result[1].trustLabel, "陌生设备");
  assert.equal(result[1].workCount, 2);
});

test("decorateDevices only marks USB and remote active from truthful capability fields", () => {
  const [device] = decorateDevices([{
    id: "iphone-6",
    displayName: "苹果6",
    models: ["iPhone8,1"],
    usbOnline: true,
    remoteOnline: false
  }], []);
  assert.equal(device.usbCapable, true);
  assert.deepEqual(device.transports, { wifi: false, usb: true, remote: false });
});
