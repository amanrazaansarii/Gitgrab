/**
 * GitGrab Options / Settings Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const tokenInput = document.getElementById('github-token');
  const toggleVisibilityBtn = document.getElementById('toggle-token-visibility');
  const testTokenBtn = document.getElementById('test-token-btn');
  const tokenFeedback = document.getElementById('token-test-feedback');
  const rateLimitBadge = document.getElementById('rate-limit-badge');

  const concurrencyRange = document.getElementById('concurrency-range');
  const concurrencyVal = document.getElementById('concurrency-val');

  const compressionRange = document.getElementById('compression-range');
  const compressionVal = document.getElementById('compression-val');

  const preserveFolderCheckbox = document.getElementById('preserve-folder-structure');
  const showToastCheckbox = document.getElementById('show-toast');

  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');

  // 1. Load saved settings
  const settings = await GitGrabStorage.getSettings();

  tokenInput.value = settings.githubToken || '';
  concurrencyRange.value = settings.concurrency || 5;
  concurrencyVal.textContent = `${settings.concurrency || 5} files`;

  compressionRange.value = settings.compressionLevel || 6;
  updateCompressionLabel(settings.compressionLevel || 6);

  preserveFolderCheckbox.checked = settings.preserveFolderStructure !== false;
  showToastCheckbox.checked = settings.showToastNotification !== false;

  // Check initial rate limit
  checkRateLimit(tokenInput.value.trim());

  // 2. Event Listeners
  // Concurrency slider
  concurrencyRange.addEventListener('input', (e) => {
    concurrencyVal.textContent = `${e.target.value} files`;
  });

  // Compression slider
  compressionRange.addEventListener('input', (e) => {
    updateCompressionLabel(e.target.value);
  });

  // Toggle token visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      toggleVisibilityBtn.textContent = '🔒';
    } else {
      tokenInput.type = 'password';
      toggleVisibilityBtn.textContent = '👁️';
    }
  });

  // Test token button
  testTokenBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    testTokenBtn.disabled = true;
    testTokenBtn.textContent = 'Testing...';
    hideFeedback();

    try {
      const downloader = new GitGrabEngine.GitHubDownloader({ token });
      const rate = await downloader.checkRateLimit();

      let userMsg = '';
      if (token) {
        // Try fetching user profile
        try {
          const userRes = await fetch('https://api.github.com/user', {
            headers: downloader.getHeaders()
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            userMsg = ` Authenticated as <strong>@${escapeHtml(userData.login)}</strong>.`;
          }
        } catch (e) {}
      }

      showFeedback(
        `✓ Token verified! API Rate Limit: <strong>${rate.remaining} of ${rate.limit} requests/hour</strong>.${userMsg}`,
        'success'
      );
      updateRateBadge(rate);
    } catch (err) {
      showFeedback(`✗ Verification failed: ${escapeHtml(err.message)}`, 'error');
    } finally {
      testTokenBtn.disabled = false;
      testTokenBtn.textContent = 'Test & Verify';
    }
  });

  // Save settings button
  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      githubToken: tokenInput.value.trim(),
      concurrency: parseInt(concurrencyRange.value, 10),
      compressionLevel: parseInt(compressionRange.value, 10),
      preserveFolderStructure: preserveFolderCheckbox.checked,
      showToastNotification: showToastCheckbox.checked
    };

    saveBtn.disabled = true;
    try {
      await GitGrabStorage.saveSettings(newSettings);
      saveStatus.classList.remove('hidden');
      setTimeout(() => {
        saveStatus.classList.add('hidden');
      }, 3000);
      checkRateLimit(newSettings.githubToken);
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Helpers
  async function checkRateLimit(token) {
    try {
      const downloader = new GitGrabEngine.GitHubDownloader({ token });
      const rate = await downloader.checkRateLimit();
      updateRateBadge(rate);
    } catch (e) {
      rateLimitBadge.textContent = 'Offline / Error';
      rateLimitBadge.className = 'badge';
    }
  }

  function updateRateBadge(rate) {
    rateLimitBadge.textContent = `${rate.remaining} / ${rate.limit} req/hr`;
    if (rate.limit > 60) {
      rateLimitBadge.className = 'badge active';
      rateLimitBadge.title = 'Authenticated with Personal Access Token (5000 req/hr)';
    } else {
      rateLimitBadge.className = 'badge';
      rateLimitBadge.title = 'Unauthenticated rate limit (60 req/hr)';
    }
  }

  function updateCompressionLabel(level) {
    const lvl = parseInt(level, 10);
    let desc = 'Balanced';
    if (lvl <= 2) desc = 'Fastest / Low CPU';
    else if (lvl <= 5) desc = 'Fast';
    else if (lvl === 6) desc = 'Balanced';
    else if (lvl >= 8) desc = 'Maximum Compression';

    compressionVal.textContent = `Level ${lvl} (${desc})`;
  }

  function showFeedback(htmlMessage, type) {
    tokenFeedback.innerHTML = htmlMessage;
    tokenFeedback.className = `feedback-msg ${type}`;
    tokenFeedback.classList.remove('hidden');
  }

  function hideFeedback() {
    tokenFeedback.classList.add('hidden');
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
