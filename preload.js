const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("dialog:openFile"),
  transcribe: (audioPath, options) =>
    ipcRenderer.invoke("transcribe", audioPath, options),

  // 下载相关事件
  onDownloadStarted: (callback) =>
    ipcRenderer.on("download-started", (event, data) => callback(data)),
  onDownloadProgress: (callback) =>
    ipcRenderer.on("download-progress", (event, data) => callback(data)),
  onDownloadCompleted: (callback) =>
    ipcRenderer.on("download-completed", (event, data) => callback(data)),

  // 转录实时进度：注册监听，返回取消监听的函数
  onTranscribeProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on("transcribe-progress", handler);
    return () => ipcRenderer.removeListener("transcribe-progress", handler);
  },
});
