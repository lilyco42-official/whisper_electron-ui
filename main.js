const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // 关键：指向 preload.js
    },
  });
  mainWindow.loadFile("index.html");
  // 开发时可以打开开发者工具
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // 处理文件选择对话框
  ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "m4a", "flac", "ogg"] },
      ],
    });
    if (canceled) return null;
    return filePaths[0];
  });

  // 处理转录请求
  ipcMain.handle("transcribe", async (event, audioPath, options = {}) => {
    const { model = "tiny", language = "", task = "transcribe" } = options;

    // 构建 whisper 命令
    // 注意：输出目录设为 temp，确保该目录存在或自动创建
    let command = `whisper "${audioPath}" --model ${model} --task ${task} --output_dir temp`;
    if (language) {
      command += ` --language ${language}`;
    }

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`执行错误: ${error}`);
          reject(error.message);
          return;
        }
        // 这里简单返回 stdout，更完善的可以读取生成的文本文件
        resolve(stdout);
      });
    });
  });

  createWindow();
});

// 其他生命周期处理（可选）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
