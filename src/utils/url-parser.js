/**
 * URL Parser utility for GitHub URLs
 * Handles repo roots, tree/folder paths, blob/file paths, and commit/branch refs.
 */

(function (global) {
  'use strict';

  /**
   * @typedef {Object} GitHubParsedInfo
   * @property {string} owner - Repository owner (user or organization)
   * @property {string} repo - Repository name
   * @property {string} [type] - 'tree' (folder), 'blob' (file), 'repo' (root), or 'other'
   * @property {string} [branch] - Branch, tag, or commit SHA (e.g. 'main', 'master', 'v1.0.0')
   * @property {string} [path] - Relative path inside repository (e.g. 'src/components' or 'README.md')
   * @property {string} [fullName] - Full repository identifier ('owner/repo')
   * @property {string} [targetName] - Name of the specific folder or file targeted
   * @property {boolean} isFile - Whether the target is a single file
   * @property {boolean} isFolder - Whether the target is a directory/folder
   * @property {boolean} isRepoRoot - Whether the target is the repository root
   */

  /**
   * Parse any GitHub URL into structured repository and path information.
   * @param {string} urlString
   * @returns {GitHubParsedInfo|null}
   */
  function parseGitHubUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return null;

    let cleanUrl = urlString.trim();

    // Clean git ssh URLs if provided
    if (cleanUrl.startsWith('git@github.com:')) {
      cleanUrl = 'https://github.com/' + cleanUrl.slice('git@github.com:'.length);
    }

    try {
      // Ensure protocol
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      const parsed = new URL(cleanUrl);
      if (!parsed.hostname.includes('github.com')) {
        return null;
      }

      // Path segments without empty items
      const segments = parsed.pathname
        .split('/')
        .map(s => decodeURIComponent(s))
        .filter(Boolean);

      if (segments.length < 2) {
        return null;
      }

      const owner = segments[0];
      let repo = segments[1];

      // Remove .git suffix if present
      if (repo.endsWith('.git')) {
        repo = repo.slice(0, -4);
      }

      // Root repository URL: https://github.com/owner/repo
      if (segments.length === 2) {
        return {
          owner,
          repo,
          type: 'repo',
          branch: '',
          path: '',
          fullName: `${owner}/${repo}`,
          targetName: repo,
          isFile: false,
          isFolder: true,
          isRepoRoot: true
        };
      }

      const action = segments[2]; // 'tree', 'blob', 'commit', 'releases', etc.

      if (action === 'tree' || action === 'blob') {
        const isFile = action === 'blob';
        const isFolder = action === 'tree';

        if (segments.length === 3) {
          // Just /tree or /blob with nothing else (unlikely but safe fallback)
          return {
            owner,
            repo,
            type: action,
            branch: '',
            path: '',
            fullName: `${owner}/${repo}`,
            targetName: repo,
            isFile,
            isFolder,
            isRepoRoot: true
          };
        }

        // The branch/ref is at segment 3, and subpath starts at segment 4
        const branch = segments[3];
        const subPathSegments = segments.slice(4);
        const subPath = subPathSegments.join('/');
        const targetName = subPathSegments.length > 0 ? subPathSegments[subPathSegments.length - 1] : repo;

        return {
          owner,
          repo,
          type: action,
          branch,
          path: subPath,
          fullName: `${owner}/${repo}`,
          targetName,
          isFile,
          isFolder: !isFile,
          isRepoRoot: subPath.length === 0
        };
      }

      // Fallback for other GitHub actions or commit URLs
      return {
        owner,
        repo,
        type: 'other',
        branch: segments.length > 3 ? segments[3] : '',
        path: segments.slice(4).join('/'),
        fullName: `${owner}/${repo}`,
        targetName: repo,
        isFile: false,
        isFolder: true,
        isRepoRoot: segments.length <= 3
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if a URL is a valid GitHub URL
   * @param {string} urlString
   * @returns {boolean}
   */
  function isValidGitHubUrl(urlString) {
    return parseGitHubUrl(urlString) !== null;
  }

  /**
   * Get raw file download URL from GitHub
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @param {string} filePath
   * @returns {string}
   */
  function getRawFileUrl(owner, repo, branch, filePath) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch || 'main')}/${filePath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  /**
   * Get full repo ZIP download URL from GitHub (zipball)
   * @param {string} owner
   * @param {string} repo
   * @param {string} [ref='HEAD']
   * @returns {string}
   */
  function getArchiveUrl(owner, repo, ref = 'HEAD') {
    return `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.zip`;
  }

  const api = {
    parseGitHubUrl,
    isValidGitHubUrl,
    getRawFileUrl,
    getArchiveUrl
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GitHubUrlParser = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
