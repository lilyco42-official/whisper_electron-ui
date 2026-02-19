// renderer.js
const selectBtn = document.getElementById("select-btn");
const transcribeBtn = document.getElementById("transcribe-btn");
const fileInfoSpan = document.getElementById("file-info");
const resultDiv = document.getElementById("result");
const statusDiv = document.getElementById("status");
const modelSelect = document.getElementById("model-select");

// 进度条元素（如果有）
const progressContainer = document.querySelector(".progress-container");
const downloadProgress = document.getElementById("download-progress");
const progressPercent = document.getElementById("progress-percent");
const progressStatus = document.getElementById("progress-status");

let removeProgressListener = null; // 用于取消实时监听

let selectedFile = null;

// 下载事件监听
window.electronAPI.onDownloadStarted(({ model }) => {
  if (progressContainer) progressContainer.style.display = "block";
  if (downloadProgress) downloadProgress.value = 0;
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressStatus) progressStatus.textContent = `正在下载 ${model} 模型...`;
  statusDiv.textContent = "";
  transcribeBtn.disabled = true;
  selectBtn.disabled = true;
});

window.electronAPI.onDownloadProgress(({ percent }) => {
  if (downloadProgress) downloadProgress.value = percent;
  if (progressPercent) progressPercent.textContent = `${percent}%`;
  if (progressStatus) progressStatus.textContent = `下载中... ${percent}%`;
});

window.electronAPI.onDownloadCompleted(({ model }) => {
  if (progressStatus)
    progressStatus.textContent = `${model} 下载完成，正在转录...`;
  // 注意：转录开始后，转录完成事件会恢复按钮，并可能隐藏进度条
});
// 选择文件
selectBtn.addEventListener("click", async () => {
  try {
    const filePath = await window.electronAPI.selectFile();
    if (filePath) {
      selectedFile = filePath;
      fileInfoSpan.textContent = `已选择: ${filePath}`;
      transcribeBtn.disabled = false;
    } else {
      selectedFile = null;
      fileInfoSpan.textContent = "未选择文件";
      transcribeBtn.disabled = true;
    }
  } catch (error) {
    alert("选择文件失败: " + error.message);
  }
});

// 开始转录
transcribeBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    alert("请先选择音频文件");
    return;
  }

  const selectedModel = modelSelect ? modelSelect.value : "tiny";

  // 界面准备
  resultDiv.textContent = ""; // 清空之前的结果
  statusDiv.textContent = "转录中，请稍候...";
  selectBtn.disabled = true;
  transcribeBtn.disabled = true;
  if (progressContainer) progressContainer.style.display = "none";

  // 如果有之前的监听，先移除
  if (removeProgressListener) {
    removeProgressListener();
    removeProgressListener = null;
  }

  // 注册实时输出监听
  removeProgressListener = window.electronAPI.onTranscribeProgress((chunk) => {
    // 将输出追加到结果区域
    resultDiv.textContent += chunk;
    // 自动滚动到底部
    resultDiv.scrollTop = resultDiv.scrollHeight;
  });

  try {
    const finalResult = await window.electronAPI.transcribe(selectedFile, {
      model: selectedModel,
    });
    // 转录完成后，如果最终结果与累积的不同，可附加显示
    if (finalResult && !resultDiv.textContent.includes(finalResult)) {
      resultDiv.textContent += "\n\n--- 最终识别结果 ---\n" + finalResult;
    }
    statusDiv.textContent = "转录完成";
  } catch (error) {
    console.error(error);
    resultDiv.textContent += `\n错误: ${error}`;
    statusDiv.textContent = "转录失败";
  } finally {
    // 移除实时监听
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
    selectBtn.disabled = false;
    transcribeBtn.disabled = false;
  }
});
