/**
 * GitGrab Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const contextContainer = document.getElementById('tab-context');
  const customUrlInput = document.getElementById('custom-url-input');
  const customDownloadBtn = document.getElementById('custom-download-btn');
  const pasteBtn = document.getElementById('paste-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const tokenStatusBadge = document.getElementById('token-status');
  const tokenStatusText = document.getElementById('token-status-text');
  const progressContainer = document.getElementById('progress-container');
  const progressTarget = document.getElementById('progress-target');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressStatus = document.getElementById('progress-status');
  const alertBox = document.getElementById('alert-box');

  let currentTabParsed = null;
  let activeDownloader = null;

  // 1. Check Rate Limit & Token Status
  await updateTokenStatus();

  // 2. Open Settings on gear click or badge click
  settingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  });

  tokenStatusBadge.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  });

  // 3. Detect Active Tab URL
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      currentTabParsed = GitHubUrlParser.parseGitHubUrl(activeTab.url);
    }
  } catch (e) {
    console.warn('Could not query active tab:', e);
  }

  renderContextCard(currentTabParsed);

  // 4. Paste Button
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        customUrlInput.value = text.trim();
        customUrlInput.focus();
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  });

  // 5. Custom URL Download Button
  customDownloadBtn.addEventListener('click', async () => {
    const rawUrl = customUrlInput.value.trim();
    if (!rawUrl) {
      showAlert('Please enter or paste a GitHub URL first.', 'error');
      return;
    }

    const parsed = GitHubUrlParser.parseGitHubUrl(rawUrl);
    if (!parsed) {
      showAlert('Invalid GitHub URL. Must be in the format: https://github.com/owner/repo/...', 'error');
      return;
    }

    await startDownload(parsed);
  });

  // Enter key trigger on input
  customUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      customDownloadBtn.click();
    }
  });

  /**
   * Render the active tab context card
   */
  function renderContextCard(parsed) {
    if (!parsed) {
      contextContainer.innerHTML = `
        <div class="context-loading" style="color: var(--text-secondary);">
          Not on a GitHub repository page.<br>
          <span style="font-size: 11px; color: var(--text-muted);">Paste any GitHub link below to download.</span>
        </div>
      `;
      return;
    }

    const targetLabel = parsed.path
      ? (parsed.isFile ? `📄 ${parsed.targetName}` : `📁 /${parsed.path}`)
      : `📦 Full Repository`;

    const primaryBtnText = parsed.isFile
      ? `⬇️ Download File (${parsed.targetName})`
      : (parsed.isRepoRoot ? `⬇️ Download Entire Repo (.zip)` : `⬇️ Download This Folder (.zip)`);

    contextContainer.innerHTML = `
      <div class="repo-details">
        <div class="repo-title-row">
          <span class="repo-name" title="${escapeHtml(parsed.fullName)}">${escapeHtml(parsed.fullName)}</span>
          <span class="branch-badge">${escapeHtml(parsed.branch || 'default')}</span>
        </div>
        <div class="current-path" title="${escapeHtml(parsed.path || 'Repository root')}">${escapeHtml(targetLabel)}</div>
      </div>
      <button id="context-download-btn" class="btn btn-primary w-full" type="button">
        ${escapeHtml(primaryBtnText)}
      </button>
      ${!parsed.isRepoRoot ? `
        <button id="context-full-repo-btn" class="btn btn-secondary w-full" type="button">
          📦 Download Full Repo (.zip)
        </button>
      ` : ''}
    `;

    document.getElementById('context-download-btn').addEventListener('click', () => {
      startDownload(parsed);
    });

    const fullRepoBtn = document.getElementById('context-full-repo-btn');
    if (fullRepoBtn) {
      fullRepoBtn.addEventListener('click', () => {
        startDownload({
          ...parsed,
          path: '',
          isFolder: true,
          isFile: false,
          isRepoRoot: true,
          targetName: parsed.repo
        });
      });
    }
  }

  /**
   * Start download process
   */
  async function startDownload(parsed) {
    hideAlert();
    showProgress(parsed.targetName || parsed.repo);

    try {
      const settings = await GitGrabStorage.getSettings();
      const downloader = new GitGrabEngine.GitHubDownloader({
        token: settings.githubToken,
        concurrency: settings.concurrency || 5,
        compressionLevel: settings.compressionLevel || 6,
        onProgress: (progress) => {
          updateProgress(progress);
        }
      });

      activeDownloader = downloader;

      if (parsed.isFile) {
        const result = await downloader.downloadSingleFile({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: parsed.branch,
          filePath: parsed.path
        });

        downloader.triggerBrowserDownload(result.blob, result.filename);
        showAlert(`Successfully downloaded ${result.filename}!`, 'success');
      } else {
        const result = await downloader.downloadFolderAsZip({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: parsed.branch,
          subpath: parsed.path || '',
          preserveRootFolder: settings.preserveFolderStructure
        });

        downloader.triggerBrowserDownload(result.blob, result.filename);
        showAlert(`Successfully created & downloaded ${result.filename}!`, 'success');
      }
    } catch (err) {
      console.error('Download error:', err);
      showAlert(err.message, 'error');
    } finally {
      setTimeout(() => {
        hideProgress();
        updateTokenStatus();
      }, 2500);
    }
  }

  /**
   * Update GitHub Token & Rate limit display
   */
  async function updateTokenStatus() {
    try {
      const token = await GitGrabStorage.getGitHubToken();
      if (token) {
        tokenStatusBadge.classList.add('authenticated');
        tokenStatusText.textContent = 'Token Active';
      } else {
        tokenStatusBadge.classList.remove('authenticated');
        tokenStatusText.textContent = 'No Token (60/hr)';
      }

      const downloader = new GitGrabEngine.GitHubDownloader({ token });
      const rate = await downloader.checkRateLimit();
      tokenStatusText.textContent = `${rate.remaining}/${rate.limit} reqs`;
    } catch (e) {
      // Offline or network error
    }
  }

  /**
   * Progress display helpers
   */
  function showProgress(targetName) {
    progressContainer.classList.remove('hidden');
    progressTarget.textContent = `Downloading ${targetName}...`;
    progressPercent.textContent = '0%';
    progressBarFill.style.width = '0%';
    progressStatus.textContent = 'Initializing...';
  }

  function updateProgress(progress) {
    if (progress.message) progressStatus.textContent = progress.message;
    if (typeof progress.percent === 'number') {
      const p = Math.min(100, Math.max(0, progress.percent));
      progressBarFill.style.width = `${p}%`;
      progressPercent.textContent = `${p}%`;
    }
  }

  function hideProgress() {
    progressContainer.classList.add('hidden');
  }

  function showAlert(message, type = 'error') {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');
  }

  function hideAlert() {
    alertBox.classList.add('hidden');
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
});
