// Content script for tl;dv Transcript Extractor
// Handles virtualized DOM blocks (#transcript-container p[data-index]) by scrolling
// through the container and harvesting each block as it renders.

(() => {
  if (window.__tldvExtractorLoaded) return;
  window.__tldvExtractorLoaded = true;

  function formatMs(ms) {
    const totalSec = Math.floor(Number(ms) / 1000);
    if (!Number.isFinite(totalSec) || totalSec < 0) return "00:00";
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  function parseBlock(p) {
    const indexAttr = p.getAttribute("data-index");
    if (indexAttr === null) return null;
    const index = Number(indexAttr);
    const timeMs = Number(p.getAttribute("data-time") || 0);

    // Virtualized unrendered blocks have no word spans inside
    const wordSpans = p.querySelectorAll('span[data-speaker="false"]');
    const speakerSpan = p.querySelector('span[data-speaker="true"]');

    if (!speakerSpan && wordSpans.length === 0) {
      return null; // Placeholder block, not rendered yet
    }

    let speaker = "Unknown";
    if (speakerSpan) {
      const btn = speakerSpan.querySelector("button");
      if (btn && btn.textContent) {
        speaker = btn.textContent.trim();
      } else {
        speaker = speakerSpan.textContent.replace(/^\d+:\d+\s*/, "").replace(/:\s*$/, "").trim() || "Unknown";
      }
    }

    let timeLabel = "";
    const timeLink = speakerSpan ? speakerSpan.querySelector("a") : null;
    if (timeLink && timeLink.textContent.trim()) {
      timeLabel = timeLink.textContent.trim();
    } else {
      timeLabel = formatMs(timeMs);
    }

    const words = [];
    wordSpans.forEach((span) => {
      const t = span.textContent;
      if (t) words.push(t.trim());
    });

    const text = words.join(" ").replace(/\s+/g, " ").trim();
    return {
      index,
      timeMs,
      timestamp: timeLabel,
      speaker,
      text
    };
  }

  function harvestVisibleBlocks(container, map) {
    const paragraphs = container.querySelectorAll("p[data-index]");
    let totalBlocks = paragraphs.length;
    paragraphs.forEach((p) => {
      const idx = Number(p.getAttribute("data-index"));
      if (!map.has(idx)) {
        const parsed = parseBlock(p);
        if (parsed) {
          map.set(idx, parsed);
        }
      }
    });
    return totalBlocks;
  }

  async function extractFullTranscript(onProgress) {
    const container = document.querySelector("#transcript-container");
    if (!container) {
      throw new Error(
        "Could not find #transcript-container. Make sure the transcript panel is open (?transcript=true)."
      );
    }

    // Pause video if playing so tl;dv's auto-scroll to current time doesn't fight our scroll loop
    const video = document.querySelector("video");
    const wasPlaying = video && !video.paused;
    if (wasPlaying) {
      video.pause();
    }

    const collected = new Map();
    const originalScrollTop = container.scrollTop;

    try {
      // 1. Harvest whatever is currently visible first
      let totalBlocks = harvestVisibleBlocks(container, collected);

      // 2. Scroll to top and wait for render
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 150));
      totalBlocks = Math.max(totalBlocks, harvestVisibleBlocks(container, collected));

      // 3. Step down through the scroll container in increments of ~65% of clientHeight
      const step = Math.max(200, Math.floor(container.clientHeight * 0.65));
      let currentPos = 0;
      let maxScroll = container.scrollHeight - container.clientHeight;
      let safetyCounter = 0;
      const maxSteps = 2000;

      while (currentPos < maxScroll && safetyCounter < maxSteps) {
        safetyCounter++;
        currentPos = Math.min(currentPos + step, maxScroll);
        container.scrollTop = currentPos;

        // Wait for virtualizer to render the newly visible <p data-index> children
        await new Promise((r) => setTimeout(r, 90));

        const currentTotal = harvestVisibleBlocks(container, collected);
        totalBlocks = Math.max(totalBlocks, currentTotal);
        maxScroll = container.scrollHeight - container.clientHeight;

        if (onProgress) {
          onProgress({
            collected: collected.size,
            total: totalBlocks
          });
        }
      }

      // 4. Sweep any remaining unrendered <p data-index> elements directly
      const allPs = Array.from(container.querySelectorAll("p[data-index]"));
      totalBlocks = Math.max(totalBlocks, allPs.length);

      for (const p of allPs) {
        const idx = Number(p.getAttribute("data-index"));
        if (!collected.has(idx)) {
          p.scrollIntoView({ block: "center" });
          await new Promise((r) => setTimeout(r, 100));
          harvestVisibleBlocks(container, collected);
          if (onProgress) {
            onProgress({
              collected: collected.size,
              total: totalBlocks
            });
          }
        }
      }
    } finally {
      container.scrollTop = originalScrollTop;
    }

    const segments = Array.from(collected.values()).sort((a, b) => a.index - b.index);
    const title = document.title.replace(/\s*[-|]\s*tl;dv.*$/i, "").trim() || "tldv-transcript";

    return {
      title,
      url: window.location.href,
      extractedAt: new Date().toISOString(),
      totalBlocks: segments.length,
      segments
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "EXTRACT_TRANSCRIPT") {
      extractFullTranscript((progress) => {
        chrome.runtime.sendMessage({
          action: "EXTRACTION_PROGRESS",
          ...progress
        }).catch(() => {});
      })
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true; // async response
    }
  });

  // Expose for unit/DOM testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseBlock, harvestVisibleBlocks, formatMs };
  }
})();
