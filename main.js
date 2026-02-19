const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const { spawn } = require("child_process");
let mainWindow;

const axios = require("axios");
const ProgressBar = require("progress");

async function downloadModel(modelFileName, targetPath, event) {
  const modelUrl = `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${modelFileName}`;
  const tempPath = targetPath + ".tmp";
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`开始下载模型: ${modelFileName}`);
  const headResponse = await axios.head(modelUrl);
  const totalLength = parseInt(headResponse.headers["content-length"], 10);

  // 终端进度条（可选）
  const progressBar = new ProgressBar(" 下载中 [:bar] :percent :etas", {
    complete: "=",
    incomplete: " ",
    width: 30,
    total: totalLength,
  });

  const writer = fs.createWriteStream(tempPath);
  const response = await axios({
    method: "get",
    url: modelUrl,
    responseType: "stream",
    onDownloadProgress: (progressEvent) => {
      if (totalLength) {
        progressBar.tick(progressEvent.bytes - progressBar.curr);
        // 发送下载进度到渲染进程
        if (event && event.sender) {
          const percent = Math.round((progressEvent.bytes / totalLength) * 100);
          event.sender.send("download-progress", {
            model: modelFileName,
            percent,
            loaded: progressEvent.bytes,
            total: totalLength,
          });
        }
      }
    },
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      fs.rename(tempPath, targetPath, (err) => {
        if (err) reject(err);
        else {
          console.log(`模型下载完成: ${modelFileName}`);
          if (event && event.sender) {
            event.sender.send("download-completed", { model: modelFileName });
          }
          resolve();
        }
      });
    });
    writer.on("error", reject);
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadFile("index.html");
  // 开发时可以打开开发者工具
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // 文件选择对话框
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

  // 模型信息映射
  const modelInfoMap = {
    tiny: { file: "ggml-tiny-q5_1.bin", size: "31 MB" },
    base: { file: "ggml-base-q5_1.bin", size: "57 MB" },
    small: { file: "ggml-small-q5_1.bin", size: "181 MB" },
    medium: { file: "ggml-medium-q5_0.bin", size: "514 MB" },
    large: { file: "ggml-large-v3-q5_0.bin", size: "1.1 GB" },
  };

  // 转录处理
  ipcMain.handle("transcribe", async (event, audioPath, options = {}) => {
    const { model = "tiny" } = options;

    // 获取模型信息
    const modelInfo = modelInfoMap[model];
    if (!modelInfo) {
      throw new Error(`不支持的模型: ${model}`);
    }
    const modelFileName = modelInfo.file;

    // 确定 whisper 目录路径
    let whisperDir;
    if (app.isPackaged) {
      whisperDir = path.join(process.resourcesPath, "whisper");
    } else {
      whisperDir = path.join(__dirname, "whisper");
    }

    const whisperExe = path.join(whisperDir, "whisper-cli.exe");
    const modelPath = path.join(whisperDir, modelFileName);

    // 检查 whisper-cli.exe 是否存在
    if (!fs.existsSync(whisperExe)) {
      throw new Error(`找不到 whisper 可执行文件: ${whisperExe}`);
    }

    // 检查模型文件是否存在，如果不存在则自动下载
    if (!fs.existsSync(modelPath)) {
      const downloadChoice = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["下载", "取消"],
        defaultId: 0,
        title: "下载模型",
        message: `本地找不到 ${model} 模型文件 (${modelInfo.size})，是否现在下载？`,
        detail: "首次使用需要下载模型，下载后会自动保存。",
      });

      if (downloadChoice.response === 0) {
        try {
          // 发送下载开始事件
          event.sender.send("download-started", { model });
          // 传递 event 以便发送进度
          await downloadModel(modelFileName, modelPath, event);
          // 下载完成后继续执行转录（无需额外操作）
        } catch (downloadError) {
          console.error("下载模型失败:", downloadError);
          throw new Error(`下载模型失败: ${downloadError.message}`);
        }
      } else {
        throw new Error("用户取消下载");
      }
    }

    // 构建命令
    //  构建命令参数（注意：spawn 需要分开传入命令和参数数组）
    const args = [
      "-m",
      modelPath,
      "-f",
      audioPath,
      "-l",
      "zh",
      "-oj", // 仍然输出 JSON 文件，同时实时输出文本
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(whisperExe, args, { cwd: whisperDir }); // 设置工作目录以确保 DLL 可找到

      let stdoutData = "";
      let stderrData = "";

      child.stdout.on("data", (data) => {
        const output = data.toString();
        stdoutData += output;
        // 实时发送到渲染进程
        event.sender.send("transcribe-progress", output);
      });

      child.stderr.on("data", (data) => {
        const errorOutput = data.toString();
        stderrData += errorOutput;
        console.error("stderr:", errorOutput);
        // 也可以发送错误信息，或忽略
      });

      child.on("close", (code) => {
        if (code === 0) {
          // 转录成功，尝试读取 JSON 文件或返回累积的 stdout
          const outputJsonPath = audioPath.replace(/\.[^/.]+$/, "") + ".json";
          fs.readFile(outputJsonPath, "utf8", (err, data) => {
            if (err) {
              // 如果没有 JSON，返回 stdout 的最后部分
              resolve(stdoutData);
            } else {
              try {
                const result = JSON.parse(data);
                const text = result.text || result.transcription || result;
                resolve(text);
              } catch (e) {
                resolve(stdoutData);
              }
            }
          });
        } else {
          reject(`转录进程退出，代码 ${code}: ${stderrData}`);
        }
      });

      child.on("error", (err) => {
        reject(`启动进程失败: ${err.message}`);
      });
    });
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
