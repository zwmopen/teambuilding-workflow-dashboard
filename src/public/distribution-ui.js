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

  function parseDeviceCheckOutput(output) {
    const match = String(output || "").match(/已登记手机\s*(\d+)\s*台；当前在线\s*(\d+)\s*台/);
    return match
      ? { registered: Number(match[1]), online: Number(match[2]) }
      : { registered: null, online: null };
  }

  return {
    filterCollections,
    matchesPlatform,
    parseDeviceCheckOutput,
    platformStateLabel
  };
}));
