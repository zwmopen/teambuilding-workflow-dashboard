const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktopFiles", {
  getPath(file) {
    return webUtils.getPathForFile(file);
  },
  sendToGpt(payload) {
    ipcRenderer.sendToHost("gpt-transfer", payload);
  }
});
