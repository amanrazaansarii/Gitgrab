/**
 * GitGrab Content Script
 * Injects download buttons into GitHub repository headers, file tables, and file views.
 */

(function () {
  'use strict';

  // SVG Icons
  const ICONS = {
    DOWNLOAD: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path></svg>`,
    ZIP: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 1.5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 3.5 14.5h9a1.5 1.5 0 0 0 1.5-1.5V3A1.5 1.5 0 0 0 12.5 1.5ZM5 3h1.5v1.5H5ZM6.5 4.5H8V6H6.5ZM5 6h1.5v1.5H5ZM6.5 7.5H8V9H6.5ZM5 9h1.5v2H5Zm2 2h2v2H7Z"></path></svg>`,
    SPINNER: `<svg class="gitgrab-spin" viewBox="0 0 16 16" width="14" height="14" style="animation: spin 1s linear infinite;"><path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0Zm0 14A6 6 0 1 1 14 8a6 6 0 0 1-6 6Z" opacity="0.25"></path><path d="M8 2a6 6 0 0 1 6 6h2A8 8 0 0 0 8 0Z"></path></svg>`,
    CLOSE: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>`
  };

  let activeDownload = null;

  // Initialize and attach observers
  init();

  function init() {
    injectButtons();

    // Observe dynamic SPA navigation and DOM changes on GitHub
    const observer = new MutationObserver(debounce(injectButtons, 250));
    observer.observe(document.body, { childList: true, subtree: true });

    // Listen to GitHub Turbo & PJAX events
    window.addEventListener('turbo:load', injectButtons);
    window.addEventListener('turbo:render', injectButtons);
    window.addEventListener('pjax:end', injectButtons);
    window.addEventListener('popstate', injectButtons);

    // Listen to messages from background service worker (e.g. context menu actions)
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'TRIGGER_DOWNLOAD_FROM_CONTEXT') {
        const info = message.parsed || GitHubUrlParser.parseGitHubUrl(message.url);
        if (info) {
          executeDownload(info);
        }
      }
    });
  }

  /**
   * Main button injection orchestrator
   */
  function injectButtons() {
    const currentUrl = window.location.href;
    const parsed = GitHubUrlParser.parseGitHubUrl(currentUrl);

    if (!parsed) return;

    injectHeaderButton(parsed);
    injectRowButtons(parsed);
    injectBlobViewButton(parsed);
  }

  /**
   * 1. Inject Header Download Button (in Breadcrumb / Action bar)
   */
  function injectHeaderButton(parsed) {
    if (document.getElementById('gitgrab-header-btn')) return;

    // Potential header container selectors in GitHub (supporting both classic and new React UI)
    const headerTargets = [
      '[data-selector="repos-split-button"]',
      'nav[aria-label="Breadcrumbs"]',
      '[data-testid="breadcrumbs-container"]',
      '.file-navigation',
      '.react-code-view-header-element',
      '.react-directory-filename-column'
    ];

    let targetContainer = null;
    for (const selector of headerTargets) {
      const el = document.querySelector(selector);
      if (el) {
        targetContainer = el;
        break;
      }
    }

    if (!targetContainer) return;

    // Create Button
    const btn = document.createElement('button');
    btn.id = 'gitgrab-header-btn';
    btn.className = 'gitgrab-btn gitgrab-btn-primary';
    btn.type = 'button';

    let btnLabel = '⬇️ Download Directory (.zip)';
    if (parsed.isRepoRoot) {
      btnLabel = '⬇️ Download Repo (.zip)';
    } else if (parsed.isFile) {
      btnLabel = '⬇️ Download File';
    }

    btn.innerHTML = `${ICONS.DOWNLOAD} <span>${btnLabel}</span>`;
    btn.title = `GitGrab: Download ${parsed.targetName} directly`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      executeDownload(parsed);
    });

    // Append in container
    if (targetContainer.parentNode && targetContainer.parentNode.classList.contains('file-navigation')) {
      targetContainer.parentNode.appendChild(btn);
    } else {
      targetContainer.appendChild(btn);
    }
  }

  /**
   * 2. Inject Download Action Buttons in GitHub File/Directory Table Rows
   */
  function injectRowButtons(currentParsed) {
    // Select all folder and file row links in GitHub
    const rowLinkSelectors = [
      'tr.react-directory-row a.Link--primary',
      'tr.react-directory-row td a',
      'div[role="row"] a.Link--primary',
      'table.files tr.js-navigation-item a.js-navigation-open',
      'div.react-directory-filename-column a.Link--primary'
    ];

    const rowLinks = document.querySelectorAll(rowLinkSelectors.join(', '));

    rowLinks.forEach((link) => {
      // Check if already injected
      if (link.dataset.gitgrabInjected === 'true') return;
      if (link.parentNode && link.parentNode.querySelector('.gitgrab-row-btn')) return;

      const href = link.getAttribute('href');
      if (!href) return;

      const fullUrl = new URL(href, window.location.origin).href;
      const parsed = GitHubUrlParser.parseGitHubUrl(fullUrl);

      if (!parsed) return;

      link.dataset.gitgrabInjected = 'true';

      const rowBtn = document.createElement('button');
      rowBtn.className = 'gitgrab-row-btn';
      rowBtn.type = 'button';
      rowBtn.innerHTML = ICONS.DOWNLOAD;
      rowBtn.title = parsed.isFolder
        ? `GitGrab: Download folder "${parsed.targetName}" as .zip`
        : `GitGrab: Download file "${parsed.targetName}"`;

      rowBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        executeDownload(parsed);
      });

      // Insert button right next to the file/folder name
      link.insertAdjacentElement('afterend', rowBtn);
    });
  }

  /**
   * 3. Inject Download Button in Single File / Blob View
   */
  function injectBlobViewButton(parsed) {
    if (!parsed.isFile) return;
    if (document.getElementById('gitgrab-blob-btn')) return;

    const actionContainer = document.querySelector(
      '[data-testid="raw-button"]'
    )?.parentElement || document.querySelector('#raw-url')?.parentElement;

    if (!actionContainer) return;

    const blobBtn = document.createElement('button');
    blobBtn.id = 'gitgrab-blob-btn';
    blobBtn.className = 'gitgrab-btn';
    blobBtn.type = 'button';
    blobBtn.innerHTML = `${ICONS.DOWNLOAD} <span>Download File</span>`;
    blobBtn.title = `GitGrab: Direct download ${parsed.targetName}`;

    blobBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeDownload(parsed);
    });

    actionContainer.insertAdjacentElement('afterbegin', blobBtn);
  }

  /**
   * Execute Download (handles folder ZIP or single file)
   */
  async function executeDownload(parsed) {
    const toast = createToast(parsed.targetName || parsed.repo);

    try {
      const settings = await GitGrabStorage.getSettings();
      const downloader = new GitGrabEngine.GitHubDownloader({
        token: settings.githubToken,
        concurrency: settings.concurrency || 5,
        compressionLevel: settings.compressionLevel || 6,
        onProgress: (progress) => {
          updateToast(toast, progress);
        }
      });

      if (parsed.isFile) {
        // Single file download
        const result = await downloader.downloadSingleFile({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: parsed.branch,
          filePath: parsed.path
        });

        downloader.triggerBrowserDownload(result.blob, result.filename);
        showToastSuccess(toast, `Downloaded ${result.filename} (${formatBytes(result.size)})`);
      } else {
        // Directory or Full Repository ZIP download
        const result = await downloader.downloadFolderAsZip({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: parsed.branch,
          subpath: parsed.path || '',
          preserveRootFolder: settings.preserveFolderStructure
        });

        downloader.triggerBrowserDownload(result.blob, result.filename);
        showToastSuccess(
          toast,
          `Saved ${result.filename} (${result.totalFiles} files, ${formatBytes(result.totalSize)})`
        );
      }
    } catch (err) {
      console.error('GitGrab download error:', err);
      showToastError(toast, err.message);
    }
  }

  /**
   * Toast Notification / Progress UI Manager
   */
  function getToastContainer() {
    let container = document.getElementById('gitgrab-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'gitgrab-toast-container';
      container.className = 'gitgrab-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function createToast(title) {
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = 'gitgrab-toast';
    toast.innerHTML = `
      <div class="gitgrab-toast-header">
        <div class="gitgrab-toast-title">
          ${ICONS.ZIP}
          <span>GitGrab: ${escapeHtml(title)}</span>
        </div>
        <button class="gitgrab-toast-close" type="button" title="Close">${ICONS.CLOSE}</button>
      </div>
      <div class="gitgrab-toast-status">Connecting to GitHub...</div>
      <div class="gitgrab-progress-bar-bg">
        <div class="gitgrab-progress-bar-fill" style="width: 5%"></div>
      </div>
    `;

    toast.querySelector('.gitgrab-toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);
    return toast;
  }

  function updateToast(toast, progress) {
    if (!toast) return;

    const statusEl = toast.querySelector('.gitgrab-toast-status');
    const fillEl = toast.querySelector('.gitgrab-progress-bar-fill');

    if (statusEl && progress.message) {
      statusEl.textContent = progress.message;
    }
    if (fillEl && typeof progress.percent === 'number') {
      fillEl.style.width = `${Math.min(100, Math.max(0, progress.percent))}%`;
    }
  }

  function showToastSuccess(toast, message) {
    if (!toast) return;
    toast.classList.add('gitgrab-toast-success');
    const statusEl = toast.querySelector('.gitgrab-toast-status');
    const fillEl = toast.querySelector('.gitgrab-progress-bar-fill');

    if (statusEl) statusEl.textContent = message;
    if (fillEl) fillEl.style.width = '100%';

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function showToastError(toast, errorMessage) {
    if (!toast) return;
    toast.classList.add('gitgrab-toast-error');
    const statusEl = toast.querySelector('.gitgrab-toast-status');
    const fillEl = toast.querySelector('.gitgrab-progress-bar-fill');

    if (statusEl) {
      statusEl.innerHTML = `<strong>Error:</strong> ${escapeHtml(errorMessage)}`;
    }
    if (fillEl) {
      fillEl.style.width = '100%';
    }
  }

  // Utilities
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
})();
