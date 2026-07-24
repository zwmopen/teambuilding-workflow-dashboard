(function distributionUiFactory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DistributionUI = api;
}(typeof window !== "undefined" ? window : globalThis, () => {
  function platformStateLabel(state) {
    return ({
      available: "可用",
      used: "已使用",
      archived: "已归档",
      reserved_pending_upload: "已领取待上传",
      confirmed_published: "已确认上传",
      unknown: "状态待确认",
      invalid: "入口异常"
    })[state] || "未知";
  }

  function matchesPlatform(collection, platform) {
    if (!platform || platform === "all") return true;
    if (platform === "dual") return Boolean(collection.dualPlatformEligible);
    if (platform === "xhs") return collection.xhs === "available";
    if (platform === "official") return collection.officialAccount === "available";
    if (platform === "official_pending") return collection.officialAccount === "reserved_pending_upload";
    if (platform === "douyin_archived") return collection.douyin === "archived" || (
      collection.douyin === "invalid" && collection.exclusionReasons?.some((reason) => /Junction|源目录/.test(reason))
    );
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
    const platformValues = ["all", "dual", "xhs", "official", "official_pending", "douyin_archived", "all_used"];
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
      ["已登记设备", deviceCheck.registered ?? registeredFallback, "台"],
      ["当前在线", deviceCheck.online ?? "点击扫描", "台"],
      ["泛流量合集包", summary.traffic || 0, "个"],
      ["团建转化（精准流量）", summary.conversion || 0, "个"]
    ];
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
    filterCollections,
    matchesPlatform,
    parseDeviceCheckOutput,
    parseDeviceStatusOutput,
    decorateDevices,
    phoneDistributionStats,
    platformStateLabel
  };
}));
