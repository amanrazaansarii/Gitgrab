# 🚀 GitGrab - GitHub Repository, Folder & File Downloader

**GitGrab** is a lightweight, ultra-fast browser extension (Manifest V3) that lets you download any GitHub repository, specific folder/subdirectory, or individual file directly to your computer in a single click — without cloning, running terminal commands, or navigating complex paths.

---

## ✨ Features

- **⚡ 1-Click Folder Download**: Injects a native `"⬇️ Download Directory (.zip)"` button right into GitHub's file navigation header and breadcrumbs.
- **📁 Row-Level Download Icons**: Hover over any folder or file row in GitHub's repository table to download it instantly.
- **📦 Full Repository Downloads**: Quick 1-click `.zip` archive download for the entire repository or specific branch.
- **🖱️ Context Menu Actions**: Right-click any GitHub directory or file link and choose `"⬇️ Download with GitGrab"`.
- **🎯 Extension Popup**:
  - Auto-detects the active GitHub tab, repository, branch, and folder.
  - Paste any GitHub URL (e.g. `https://github.com/owner/repo/tree/main/src/components`) to download immediately.
  - Live animated progress bar showing indexing, file download counts, transferred bytes, and compression status.
- **🔒 100% Client-Side & Private**: All fetching, filtering, and ZIP generation happens directly inside your browser memory using JSZip. Zero external servers, tracking, or intermediaries.
- **⚡ Rate-Limit Bypass**: Built-in support for optional GitHub Personal Access Tokens (PAT) to boost API limits from 60 to **5,000 requests/hour** and download from private repositories.

---

## 📥 Installation Guide

### Google Chrome / Brave / Microsoft Edge / Opera

1. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer Mode** (toggle switch in the top-right or top-left corner).
3. Click the **Load unpacked** button.
4. Select the `calm-davinci` directory containing `manifest.json`.
5. Pin the **GitGrab** icon to your browser toolbar!

---

## 📖 How to Use

### Method 1: In-Page Buttons on GitHub (Recommended)
1. Open any repository or folder on [github.com](https://github.com).
2. Look at the top navigation bar / breadcrumbs: you will see a green `"⬇️ Download Directory (.zip)"` button.
3. Click it — a floating progress toast appears in the bottom right, packages the folder into a `.zip`, and automatically triggers your browser download.
4. You can also hover over individual table rows and click the small download icon next to any folder or file.

### Method 2: Extension Popup
1. Click the **GitGrab** icon in your browser toolbar.
2. If you are on a GitHub page, the current folder and branch are pre-selected: click **"Download This Folder (.zip)"**.
3. Or, paste any GitHub folder or file link into the input box and click **"Download from URL"**.

### Method 3: Right-Click Context Menu
1. Right-click any link to a GitHub folder or file.
2. Select **"⬇️ Download with GitGrab (Folder ZIP / File)"**.

---

## ⚙️ Settings & GitHub Token (Optional)

Unauthenticated users get 60 GitHub API requests per hour. For heavy use or large repositories:

1. Click the **Settings (gear)** icon in the GitGrab popup or go to Extension Options.
2. Generate a free token on GitHub:
   - Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens/new).
   - Set note to `GitGrab`. No special permissions/scopes needed for public repositories!
   - Copy the token and paste it into GitGrab settings.
3. Click **Test & Verify** and **Save Settings**. Your limit is now **5,000 requests/hour**.

---

## 🏗️ Architecture

```
calm-davinci/
├── manifest.json                  # Manifest V3 extension configuration
├── icons/                         # Extension icons (16, 32, 48, 128)
├── src/
│   ├── background/
│   │   └── background.js          # Service worker (Context menus & dispatching)
│   ├── content/
│   │   ├── content.js             # GitHub DOM injector & Turbo/PJAX observer
│   │   └── content.css            # GitHub Primer-matched styles & Toast UI
│   ├── popup/
│   │   ├── popup.html             # Extension popup UI
│   │   ├── popup.css              # Dark/light mode popup styling
│   │   └── popup.js              # Active tab parser, downloader controller
│   ├── options/
│   │   ├── options.html           # Settings & PAT configuration
│   │   ├── options.css            # Settings styling
│   │   └── options.js             # Token tester & preferences manager
│   ├── lib/
│   │   ├── jszip.min.js           # In-browser ZIP archive engine
│   │   └── github-api.js          # Git Trees resolver & concurrent downloader
│   └── utils/
│       ├── url-parser.js          # URL parser for tree, blob, branch & tags
│       └── storage.js             # Chrome storage sync/local wrapper
└── test/                          # Unit and integration test suites
```

---

## 🧪 Running Tests

To run the automated test suite locally:

```bash
# Run URL parser unit tests
node test/test-parser.js

# Run Downloader and JSZip integration tests
node test/test-integration.js
```
