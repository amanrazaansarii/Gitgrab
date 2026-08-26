/**
 * Storage utility for GitGrab Extension settings
 * Manages GitHub PAT token, concurrency limits, compression level, and user preferences.
 */

(function (global) {
  'use strict';

  const DEFAULT_SETTINGS = {
    githubToken: '',
    concurrency: 5,
    compressionLevel: 6, // 1 (fastest) to 9 (highest)
    preserveFolderStructure: true,
    showToastNotification: true,
    autoDownload: true
  };

  /**
   * Get settings from chrome.storage
   * @param {Array<string>|null} keys
   * @returns {Promise<Object>}
   */
  async function getSettings(keys = null) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        // Fallback for non-extension environment
        try {
          const stored = localStorage.getItem('gitgrab_settings');
          const parsed = stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
          resolve(keys ? Object.fromEntries(keys.map(k => [k, parsed[k]])) : parsed);
        } catch (e) {
          resolve(DEFAULT_SETTINGS);
        }
        return;
      }

      const storageArea = chrome.storage.sync || chrome.storage.local;
      storageArea.get(keys || DEFAULT_SETTINGS, (items) => {
        if (chrome.runtime.lastError) {
          console.warn('Storage sync failed, trying local:', chrome.runtime.lastError);
          chrome.storage.local.get(keys || DEFAULT_SETTINGS, (localItems) => {
            resolve({ ...DEFAULT_SETTINGS, ...localItems });
          });
        } else {
          resolve({ ...DEFAULT_SETTINGS, ...items });
        }
      });
    });
  }

  /**
   * Save settings to chrome.storage
   * @param {Object} settings
   * @returns {Promise<void>}
   */
  async function saveSettings(settings) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        try {
          const current = JSON.parse(localStorage.getItem('gitgrab_settings') || '{}');
          localStorage.setItem('gitgrab_settings', JSON.stringify({ ...current, ...settings }));
          resolve();
        } catch (e) {
          reject(e);
        }
        return;
      }

      const storageArea = chrome.storage.sync || chrome.storage.local;
      storageArea.set(settings, () => {
        if (chrome.runtime.lastError) {
          // Fallback to local if sync quota exceeded
          chrome.storage.local.set(settings, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get GitHub Token
   * @returns {Promise<string>}
   */
  async function getGitHubToken() {
    const settings = await getSettings(['githubToken']);
    return settings.githubToken ? settings.githubToken.trim() : '';
  }

  const api = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getGitHubToken
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GitGrabStorage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
