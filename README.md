# tl;dv Transcript Extractor

Chrome Extension (Manifest V3) to extract full meeting transcripts from `tldv.io/app/meetings/*`, including virtualized/lazy-loaded transcript blocks (`#transcript-container p[data-index]`).

## Features

- Scrolls `#transcript-container` automatically to render and collect all virtualized transcript paragraphs.
- Pauses video playback during extraction so tl;dv's auto-scroll does not interfere, then restores scroll position.
- Toggle timestamps and merge consecutive turns from the same speaker.
- Copy to clipboard or export as `.txt`, `.md`, or `.json`.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome / Brave / Arc / Edge.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `tldv-transcript-extractor` folder.
5. Open a tl;dv meeting page with the transcript open (`?transcript=true`), click the extension icon, and click **Extract Full Transcript**.
