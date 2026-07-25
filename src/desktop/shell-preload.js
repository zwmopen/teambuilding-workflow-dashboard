const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopShellBridge", {
  prepareGptTransfer(payload) {
    return ipcRenderer.invoke("gpt:prepare-transfer", payload);
  }
});
