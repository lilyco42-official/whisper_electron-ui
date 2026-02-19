const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // 选择文件
  selectFile: () => ipcRenderer.invoke("dialog:openFile"),
  // 转录
  transcribe: (audioPath, options) =>
    ipcRenderer.invoke("transcribe", audioPath, options),
});
