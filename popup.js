let currentResult = null;

const extractBtn = document.getElementById("extractBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadTxtBtn = document.getElementById("downloadTxtBtn");
const downloadMdBtn = document.getElementById("downloadMdBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const includeTimestampsEl = document.getElementById("includeTimestamps");
const mergeConsecutiveEl = document.getElementById("mergeConsecutive");
const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const countBadge = document.getElementById("countBadge");

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === "EXTRACTION_PROGRESS") {
    statusEl.textContent = `Scrolling & harvesting... ${msg.collected} / ${msg.total} blocks`;
    countBadge.textContent = `${msg.collected}/${msg.total}`;
  }
});

function buildProcessedSegments(segments, mergeConsecutive) {
  if (!mergeConsecutive) return segments;
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.speaker === seg.speaker) {
      prev.text = `${prev.text} ${seg.text}`.trim();
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function formatTranscriptText(result, { includeTimestamps, mergeConsecutive, markdown = false }) {
  if (!result || !result.segments) return "";
  const segments = buildProcessedSegments(result.segments, mergeConsecutive);
  const lines = [];

  if (markdown) {
    lines.push(`# ${result.title}`);
    lines.push(`- **URL:** ${result.url}`);
    lines.push(`- **Extracted:** ${result.extractedAt}`);
    lines.push("");
  }

  for (const seg of segments) {
    const ts = includeTimestamps ? `[${seg.timestamp}] ` : "";
    if (markdown) {
      lines.push(`${ts}**${seg.speaker}:** ${seg.text}`);
    } else {
      lines.push(`${ts}${seg.speaker}: ${seg.text}`);
    }
  }

  return lines.join("\n\n");
}

function refreshOutput() {
  if (!currentResult) return;
  const text = formatTranscriptText(currentResult, {
    includeTimestamps: includeTimestampsEl.checked,
    mergeConsecutive: mergeConsecutiveEl.checked,
    markdown: false
  });
  outputEl.value = text;
}

includeTimestampsEl.addEventListener("change", refreshOutput);
mergeConsecutiveEl.addEventListener("change", refreshOutput);

extractBtn.addEventListener("click", async () => {
  extractBtn.disabled = true;
  statusEl.textContent = "Starting extraction...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    // Ensure content script is injected even if the tab was opened before installing the extension
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_TRANSCRIPT" });
    if (!response || !response.ok) {
      throw new Error(response ? response.error : "No response from page.");
    }

    currentResult = response.data;
    countBadge.textContent = `${currentResult.totalBlocks} blocks`;
    statusEl.textContent = `Extracted ${currentResult.totalBlocks} blocks.`;
    refreshOutput();

    copyBtn.disabled = false;
    downloadTxtBtn.disabled = false;
    downloadMdBtn.disabled = false;
    downloadJsonBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    extractBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  if (!outputEl.value) return;
  await navigator.clipboard.writeText(outputEl.value);
  const orig = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = orig;
  }, 1500);
});

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(str) {
  return (str || "tldv-transcript")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tldv-transcript";
}

downloadTxtBtn.addEventListener("click", () => {
  if (!currentResult) return;
  const text = formatTranscriptText(currentResult, {
    includeTimestamps: includeTimestampsEl.checked,
    mergeConsecutive: mergeConsecutiveEl.checked,
    markdown: false
  });
  triggerDownload(`${safeSlug(currentResult.title)}.txt`, text, "text/plain;charset=utf-8");
});

downloadMdBtn.addEventListener("click", () => {
  if (!currentResult) return;
  const md = formatTranscriptText(currentResult, {
    includeTimestamps: includeTimestampsEl.checked,
    mergeConsecutive: mergeConsecutiveEl.checked,
    markdown: true
  });
  triggerDownload(`${safeSlug(currentResult.title)}.md`, md, "text/markdown;charset=utf-8");
});

downloadJsonBtn.addEventListener("click", () => {
  if (!currentResult) return;
  triggerDownload(
    `${safeSlug(currentResult.title)}.json`,
    JSON.stringify(currentResult, null, 2),
    "application/json;charset=utf-8"
  );
});
