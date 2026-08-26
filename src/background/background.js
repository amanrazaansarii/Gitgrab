/**
 * Background Service Worker for GitGrab (Manifest V3)
 * Handles context menus, downloads coordination, and inter-script messaging.
 */

// Import required utilities in worker context
importScripts('../utils/url-parser.js', '../utils/storage.js');

// Create context menu items on installation
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // 1. Context menu when right-clicking on a link
    chrome.contextMenus.create({
      id: 'gitgrab_download_link',
      title: '⬇️ Download with GitGrab (Folder ZIP / File)',
      contexts: ['link'],
      targetUrlPatterns: ['*://github.com/*/*']
    });

    // 2. Context menu on GitHub page background / selection
    chrome.contextMenus.create({
      id: 'gitgrab_download_current_page',
      title: '⬇️ GitGrab: Download Current Directory (.zip)',
      contexts: ['page'],
      documentUrlPatterns: ['*://github.com/*/*']
    });

    // 3. Quick download entire repo
    chrome.contextMenus.create({
      id: 'gitgrab_download_full_repo',
      title: '📦 GitGrab: Download Entire Repository (.zip)',
      contexts: ['page', 'link'],
      documentUrlPatterns: ['*://github.com/*/*'],
      targetUrlPatterns: ['*://github.com/*/*']
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.pageUrl || (tab ? tab.url : '');
  if (!targetUrl) return;

  const parsed = GitHubUrlParser.parseGitHubUrl(targetUrl);
  if (!parsed) {
    notifyUser('Invalid URL', 'This link does not appear to be a valid GitHub repository or path.');
    return;
  }

  if (info.menuItemId === 'gitgrab_download_full_repo') {
    // Download full repo
    const downloadUrl = GitHubUrlParser.getArchiveUrl(parsed.owner, parsed.repo, parsed.branch || 'HEAD');
    chrome.downloads.download({
      url: downloadUrl,
      filename: `${parsed.repo}-${parsed.branch || 'main'}.zip`,
      saveAs: true
    });
    return;
  }

  // Forward request to content script on the tab to perform download with in-page UI progress
  if (tab && tab.id) {
    try {
      chrome.tabs.sendMessage(tab.id, {
        action: 'TRIGGER_DOWNLOAD_FROM_CONTEXT',
        url: targetUrl,
        parsed
      });
    } catch (e) {
      console.warn('Could not communicate with tab:', e);
    }
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'DOWNLOAD_FILE_VIA_CHROME') {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename,
        saveAs: message.saveAs || false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true; // async response
  }

  if (message.action === 'SHOW_NOTIFICATION') {
    notifyUser(message.title, message.message);
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Display desktop notification if permitted
 */
function notifyUser(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title || 'GitGrab',
      message: message || ''
    });
  }
}
