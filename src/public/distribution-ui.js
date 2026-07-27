(function distributionUiFactory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DistributionUI = api;
}(typeof window !== "undefined" ? window : globalThis, () => {
  function platformStateLabel(state) {
    return ({
      available: "可用",
      used: "已使用",
      archived: "已使用",
      reserved_pending_upload: "已打开，待确认上传",
      confirmed_published: "上传已完成",
      unknown: "状态待确认",
      invalid: "未登记"
    })[state] || "未知";
  }

  function matchesPlatform(collection, platform) {
    if (!platform || platform === "all") return true;
    if (platform === "dual") return Boolean(collection.dualPlatformEligible);
    if (platform === "xhs") return collection.xhs === "available";
    if (platform === "official") return collection.officialAccount === "available";
    if (platform === "official_pending") return collection.officialAccount === "reserved_pending_upload";
    if (platform === "all_used") {
      return collection.xhs !== "available"
        && collection.douyin !== "available"
        && collection.officialAccount !== "available";
    }
    return true;
  }

  function filterCollections(collections, filters = {}) {
    const query = String(filters.query || "").trim().toLowerCase();
    return (collections || []).filter((collection) => {
      const typeMatch = !filters.type || filters.type === "all" || collection.type === filters.type;
      const platformMatch = matchesPlatform(collection, filters.platform);
      const haystack = [
        collection.name,
        collection.typeLabel,
        platformStateLabel(collection.xhs),
        platformStateLabel(collection.douyin),
        platformStateLabel(collection.officialAccount),
        ...(collection.exclusionReasons || [])
      ].join(" ").toLowerCase();
      return typeMatch && platformMatch && (!query || haystack.includes(query));
    });
  }

  function countCollectionFacets(collections, filters = {}) {
    const typeValues = ["all", "traffic", "conversion", "unclassified"];
    const platformValues = ["all", "dual", "xhs", "official", "official_pending", "all_used"];
    const count = (nextFilters) => filterCollections(collections, nextFilters).length;

    return {
      types: Object.fromEntries(typeValues.map((type) => [
        type,
        count({ ...filters, type, platform: filters.platform || "all" })
      ])),
      platforms: Object.fromEntries(platformValues.map((platform) => [
        platform,
        count({ ...filters, type: filters.type || "all", platform })
      ]))
    };
  }

  function parseDeviceCheckOutput(output) {
    const match = String(output || "").match(/已登记手机\s*(\d+)\s*台；当前在线\s*(\d+)\s*台/);
    return match
      ? { registered: Number(match[1]), online: Number(match[2]) }
      : { registered: null, online: null };
  }

  function phoneDistributionStats(summary = {}, deviceCheck = {}, registeredFallback = 0) {
    return [
      {
        id: "devices",
        label: "当前设备在线",
        value: `${deviceCheck.online ?? 0}/${deviceCheck.registered ?? registeredFallback}`,
        unit: "台"
      },
      { id: "traffic", label: "泛流量合集包", value: summary.traffic || 0, unit: "个" },
      { id: "conversion", label: "团建转化（精准流量）", value: summary.conversion || 0, unit: "个" }
    ];
  }

  function countDistributablePackages(collections = []) {
    return (Array.isArray(collections) ? collections : [])
      .filter((collection) => collection.dualPlatformEligible)
      .reduce((counts, collection) => {
        if (collection.type === "traffic" || collection.type === "conversion") {
          counts[collection.type] += 1;
        }
        return counts;
      }, { traffic: 0, conversion: 0 });
  }

  function normalizeDeviceIdentity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/（[^）]*作品数[^）]*）/g, "")
      .replace(/\([^)]*作品数[^)]*\)/g, "")
      .replace(/[\s（）()·_\-/\\]+/g, "");
  }

  function parseDeviceStatusOutput(output) {
    return String(output || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t").map((part) => part.trim());
        if (parts.length < 3 || parts[parts.length - 1] !== "online") return null;
        const name = parts[0];
        const workMatch = name.match(/作品数\s*(\d+)/);
        return {
          name,
          model: parts[1],
          online: true,
          transport: "wifi",
          workCount: workMatch ? Number(workMatch[1]) : null
        };
      })
      .filter(Boolean);
  }

  function decorateDevices(devices, onlineRecords) {
    const records = Array.isArray(onlineRecords) ? onlineRecords : [];
    return (Array.isArray(devices) ? devices : [])
      .map((device, sourceIndex) => {
        const models = Array.isArray(device.models)
          ? device.models
          : [device.model].filter(Boolean);
        const aliases = [
          device.displayName,
          device.name,
          device.label,
          ...(Array.isArray(device.aliases) ? device.aliases : [])
        ].map(normalizeDeviceIdentity).filter(Boolean);
        const live = records.find((record) => {
          const liveModel = normalizeDeviceIdentity(record.model);
          if (models.some((model) => normalizeDeviceIdentity(model) === liveModel)) return true;
          const liveName = normalizeDeviceIdentity(record.name);
          return aliases.some((alias) =>
            alias.length >= 2 && (liveName.includes(alias) || alias.includes(liveName))
          );
        });
        return {
          ...device,
          online: Boolean(live),
          recentlySeen: Boolean(live?.recentlySeen || live?.current === false),
          transport: live?.transport || "",
          transports: {
            wifi: Boolean(live),
            usb: device.usbOnline === true,
            remote: device.remoteOnline === true
          },
          usbCapable: /iphone\s*6|苹果\s*6|iphone8,[12]/i.test([
            device.id,
            device.displayName,
            ...models
          ].join(" ")),
          liveName: live ? live.name : "",
          workCount: live ? live.workCount : null,
          _sourceIndex: sourceIndex
        };
      })
      .sort((left, right) => {
        if (left.online !== right.online) return left.online ? -1 : 1;
        const leftNumber = Number(left.number);
        const rightNumber = Number(right.number);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
          return leftNumber - rightNumber;
        }
        return left._sourceIndex - right._sourceIndex;
      });
  }

  return {
    countCollectionFacets,
    countDistributablePackages,
    filterCollections,
    matchesPlatform,
    parseDeviceCheckOutput,
    parseDeviceStatusOutput,
    decorateDevices,
    phoneDistributionStats,
    platformStateLabel
  };
}));
