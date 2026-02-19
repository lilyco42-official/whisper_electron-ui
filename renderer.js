// renderer.js
const selectBtn = document.getElementById("select-btn");
const transcribeBtn = document.getElementById("transcribe-btn");
const resultDiv = document.getElementById("result");
const fileInfoSpan = document.getElementById("file-info");

let selectedFile = null;

selectBtn.addEventListener("click", async () => {
  // 调用 preload 中暴露的 selectFile
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    selectedFile = filePath;
    fileInfoSpan.textContent = `已选择: ${filePath}`;
  } else {
    fileInfoSpan.textContent = "未选择文件";
  }
});

transcribeBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    alert("请先选择音频文件");
    return;
  }
  resultDiv.textContent = "转录中，请稍候...";
  try {
    // 调用 preload 中暴露的 transcribe
    const output = await window.electronAPI.transcribe(selectedFile, {
      model: "tiny", // 可改为 'base', 'small', 'medium', 'large'
      language: "zh", // 语言代码，例如 'en', 'ja', 'fr'，不指定则自动检测
      task: "transcribe", // 或 'translate' 翻译成英文
    });
    resultDiv.textContent = output;
  } catch (error) {
    resultDiv.textContent = `错误: ${error}`;
  }
});
