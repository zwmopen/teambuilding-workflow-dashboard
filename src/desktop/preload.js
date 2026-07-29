const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktopFiles", {
  getPath(file) {
    return webUtils.getPathForFile(file);
  }
});

contextBridge.exposeInMainWorld("desktopDialogs", {
  pickFolder(options = {}) {
    return ipcRenderer.invoke("desktop:pick-folder", {
      title: String(options.title || "选择文件夹"),
      defaultPath: String(options.defaultPath || "")
    });
  }
});
