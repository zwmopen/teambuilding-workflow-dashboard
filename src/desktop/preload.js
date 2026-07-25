const { contextBridge, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktopFiles", {
  getPath(file) {
    return webUtils.getPathForFile(file);
  }
});
