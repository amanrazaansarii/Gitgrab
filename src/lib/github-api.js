/**
 * Core GitHub API & Batch Downloader Engine
 * Downloads entire repositories, folders, or single files with in-browser ZIP generation.
 */

(function (global) {
  'use strict';

  class GitHubDownloader {
    constructor(options = {}) {
      this.token = options.token || '';
      this.concurrency = options.concurrency || 5;
      this.compressionLevel = options.compressionLevel || 6;
      this.onProgress = options.onProgress || (() => {});
    }

    /**
     * Set/update GitHub authentication token
     * @param {string} token
     */
    setToken(token) {
      this.token = token ? token.trim() : '';
    }

    /**
     * Helper to create standard request headers
     * @param {Object} [extraHeaders={}]
     * @returns {Headers}
     */
    getHeaders(extraHeaders = {}) {
      const headers = new Headers({
        'Accept': 'application/vnd.github.v3+json',
        ...extraHeaders
      });

      if (this.token) {
        headers.set('Authorization', `token ${this.token}`);
      }

      return headers;
    }

    /**
     * Check GitHub API rate limit status
     * @returns {Promise<{limit: number, remaining: number, resetDate: Date}>}
     */
    async checkRateLimit() {
      const res = await fetch('https://api.github.com/rate_limit', {
        headers: this.getHeaders()
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch rate limit: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const core = data.resources.core;
      return {
        limit: core.limit,
        remaining: core.remaining,
        resetDate: new Date(core.reset * 1000)
      };
    }

    /**
     * Fetch repository metadata (default branch, description, size, etc.)
     * @param {string} owner
     * @param {string} repo
     * @returns {Promise<Object>}
     */
    async getRepoInfo(owner, repo) {
      const url = `https://api.github.com/repos/${owner}/${repo}`;
      const res = await fetch(url, { headers: this.getHeaders() });

      if (res.status === 404) {
        throw new Error(`Repository "${owner}/${repo}" not found or is private without token.`);
      }
      if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          throw new Error(
            'GitHub API rate limit exceeded. Please add a Personal Access Token in GitGrab settings to bypass the 60 req/hr limit.'
          );
        }
        throw new Error('Access forbidden. If this repository is private, please provide a valid Personal Access Token.');
      }
      if (!res.ok) {
        throw new Error(`GitHub API error (${res.status}): ${res.statusText}`);
      }

      return await res.json();
    }

    /**
     * Resolve the commit SHA or branch tree reference
     * @param {string} owner
     * @param {string} repo
     * @param {string} branchOrRef
     * @returns {Promise<string>} Commit SHA / Tree SHA
     */
    async resolveTreeRef(owner, repo, branchOrRef) {
      // 1. If it's already a full 40-char SHA, return directly
      if (/^[0-9a-f]{40}$/i.test(branchOrRef)) {
        return branchOrRef;
      }

      // 2. Try fetching commit for branch/ref
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branchOrRef)}`;
      const res = await fetch(url, { headers: this.getHeaders() });

      if (res.ok) {
        const data = await res.json();
        return data.sha;
      }

      // 3. Fallback: try getting branch reference directly
      const branchUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branchOrRef)}`;
      const branchRes = await fetch(branchUrl, { headers: this.getHeaders() });

      if (branchRes.ok) {
        const branchData = await branchRes.json();
        return branchData.commit.sha;
      }

      // If failed, return the original ref string as fallback for tree API
      return branchOrRef;
    }

    /**
     * Fetch complete git tree recursively in 1 API call
     * @param {string} owner
     * @param {string} repo
     * @param {string} treeSha
     * @returns {Promise<Array<{path: string, mode: string, type: string, sha: string, size?: number, url: string}>>}
     */
    async getGitTree(owner, repo, treeSha) {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;
      const res = await fetch(url, { headers: this.getHeaders() });

      if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          throw new Error('GitHub API rate limit exceeded. Please configure a GitHub Token in GitGrab settings.');
        }
        throw new Error('Access forbidden while reading git tree.');
      }
      if (res.status === 404) {
        throw new Error(`Git tree not found for ref "${treeSha}". Check branch/commit name.`);
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch git tree (${res.status}): ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.tree || !Array.isArray(data.tree)) {
        throw new Error('Invalid tree response from GitHub API.');
      }

      return data.tree;
    }

    /**
     * Recursively fetch contents using GitHub Contents API (fallback if Git Tree is truncated or unavailable)
     * @param {string} owner
     * @param {string} repo
     * @param {string} subpath
     * @param {string} ref
     * @returns {Promise<Array<{path: string, type: string, download_url: string, size: number}>>}
     */
    async getContentsRecursive(owner, repo, subpath, ref) {
      const files = [];
      const queue = [subpath];

      while (queue.length > 0) {
        const currentPath = queue.shift();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(currentPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`;
        const res = await fetch(url, { headers: this.getHeaders() });

        if (!res.ok) {
          throw new Error(`Failed to fetch path contents: ${currentPath} (${res.status})`);
        }

        const items = await res.json();
        const arrayItems = Array.isArray(items) ? items : [items];

        for (const item of arrayItems) {
          if (item.type === 'file') {
            files.push({
              path: item.path,
              type: 'blob',
              sha: item.sha,
              size: item.size,
              download_url: item.download_url
            });
          } else if (item.type === 'dir') {
            queue.push(item.path);
          }
        }
      }

      return files;
    }

    /**
     * Download a single raw file content
     * @param {string} owner
     * @param {string} repo
     * @param {string} branch
     * @param {string} filePath
     * @param {string} [blobSha]
     * @param {number} [retries=3]
     * @returns {Promise<ArrayBuffer>}
     */
    async fetchFileContent(owner, repo, branch, filePath, blobSha = null, retries = 3) {
      let lastError = null;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Attempt 1: Fetch directly from raw.githubusercontent.com (fast, handles binary, no API limit!)
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`;

          const rawHeaders = {};
          if (this.token) {
            rawHeaders['Authorization'] = `token ${this.token}`;
          }

          const res = await fetch(rawUrl, { headers: rawHeaders });

          if (res.ok) {
            return await res.arrayBuffer();
          }

          // If raw URL fails (e.g., private repo or 404), try blob API if sha exists
          if (blobSha) {
            const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${blobSha}`;
            const blobRes = await fetch(blobUrl, {
              headers: this.getHeaders({
                'Accept': 'application/vnd.github.v3.raw'
              })
            });

            if (blobRes.ok) {
              return await blobRes.arrayBuffer();
            }
          }

          throw new Error(`HTTP ${res.status}: Failed to download ${filePath}`);
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            // Wait briefly before retry with exponential backoff
            await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
          }
        }
      }

      throw lastError || new Error(`Failed to download ${filePath} after ${retries} attempts.`);
    }

    /**
     * Download a specific directory or entire repository as a ZIP archive
     * @param {Object} params
     * @param {string} params.owner - Repository owner
     * @param {string} params.repo - Repository name
     * @param {string} [params.branch] - Branch / commit / tag
     * @param {string} [params.subpath=''] - Subdirectory to download (empty string for entire repo)
     * @param {boolean} [params.preserveRootFolder=false] - Whether to wrap contents in the root folder name
     * @returns {Promise<{blob: Blob, filename: string, totalFiles: number, totalSize: number}>}
     */
    async downloadFolderAsZip({
      owner,
      repo,
      branch = '',
      subpath = '',
      preserveRootFolder = false
    }) {
      // 1. Resolve repository info & default branch if needed
      this.onProgress({
        phase: 'initializing',
        message: 'Connecting to GitHub repository...',
        percent: 5,
        current: 0,
        total: 0
      });

      let targetBranch = branch;
      if (!targetBranch) {
        const repoInfo = await this.getRepoInfo(owner, repo);
        targetBranch = repoInfo.default_branch || 'main';
      }

      // Clean normalized subpath (remove leading & trailing slashes)
      const cleanSubpath = (subpath || '').replace(/^\/+|\/+$/g, '');

      // 2. Resolve tree SHA & get recursive tree
      this.onProgress({
        phase: 'indexing',
        message: `Indexing files in ${cleanSubpath ? cleanSubpath : 'repository'}...`,
        percent: 15,
        current: 0,
        total: 0
      });

      let tree = [];
      try {
        const treeSha = await this.resolveTreeRef(owner, repo, targetBranch);
        tree = await this.getGitTree(owner, repo, treeSha);
      } catch (err) {
        console.warn('Git Trees API failed, falling back to contents API:', err.message);
        tree = await this.getContentsRecursive(owner, repo, cleanSubpath, targetBranch);
      }

      // 3. Filter files (blobs only) matching the requested subpath
      const prefix = cleanSubpath ? (cleanSubpath.endsWith('/') ? cleanSubpath : cleanSubpath + '/') : '';
      const matchedFiles = tree.filter((item) => {
        if (item.type !== 'blob') return false;
        if (!cleanSubpath) return true; // entire repo
        return item.path === cleanSubpath || item.path.startsWith(prefix);
      });

      if (matchedFiles.length === 0) {
        throw new Error(
          cleanSubpath
            ? `No files found in folder "${cleanSubpath}". Check if the path exists on branch "${targetBranch}".`
            : 'Repository appears to be empty.'
        );
      }

      const totalFiles = matchedFiles.length;
      let downloadedCount = 0;
      let totalBytes = 0;

      // 4. Initialize JSZip
      const JSZipClass = (typeof JSZip !== 'undefined' ? JSZip : global.JSZip);
      if (!JSZipClass) {
        throw new Error('JSZip library is missing. Please ensure jszip.min.js is loaded.');
      }

      const zip = new JSZipClass();

      // Folder naming logic
      const folderBaseName = cleanSubpath
        ? cleanSubpath.split('/').pop()
        : repo;

      this.onProgress({
        phase: 'downloading',
        message: `Downloading ${totalFiles} files...`,
        percent: 20,
        current: 0,
        total: totalFiles
      });

      // 5. Download files concurrently with concurrency pool
      const pool = [];
      let index = 0;

      const downloadTask = async (file) => {
        try {
          const content = await this.fetchFileContent(
            owner,
            repo,
            targetBranch,
            file.path,
            file.sha,
            3
          );

          totalBytes += content.byteLength;

          // Determine relative zip path
          let relativePath;
          if (cleanSubpath) {
            if (file.path === cleanSubpath) {
              // Single file case
              relativePath = file.path.split('/').pop();
            } else {
              // Subfolder case: strip the parent folder prefix
              relativePath = file.path.slice(prefix.length);
            }
          } else {
            relativePath = file.path;
          }

          if (preserveRootFolder && cleanSubpath) {
            relativePath = `${folderBaseName}/${relativePath}`;
          }

          zip.file(relativePath, content, { binary: true });

          downloadedCount++;
          const progressPercent = 20 + Math.floor((downloadedCount / totalFiles) * 65);

          this.onProgress({
            phase: 'downloading',
            message: `Downloaded ${downloadedCount} of ${totalFiles} files`,
            percent: progressPercent,
            current: downloadedCount,
            total: totalFiles,
            currentFile: file.path,
            totalBytes
          });
        } catch (err) {
          console.error(`Failed to download ${file.path}:`, err);
          throw new Error(`Failed downloading "${file.path}": ${err.message}`);
        }
      };

      // Execute worker pool with concurrency limit
      const executing = [];
      for (const file of matchedFiles) {
        const p = downloadTask(file).then(() => {
          executing.splice(executing.indexOf(p), 1);
        });
        executing.push(p);
        if (executing.length >= this.concurrency) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);

      // 6. Generate ZIP Archive
      this.onProgress({
        phase: 'zipping',
        message: 'Packaging files into ZIP archive...',
        percent: 88,
        current: totalFiles,
        total: totalFiles,
        totalBytes
      });

      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: {
            level: this.compressionLevel
          }
        },
        (metadata) => {
          const zipPercent = 88 + Math.floor((metadata.percent / 100) * 11);
          this.onProgress({
            phase: 'zipping',
            message: `Compressing ZIP (${Math.round(metadata.percent)}%)...`,
            percent: zipPercent,
            current: totalFiles,
            total: totalFiles,
            totalBytes
          });
        }
      );

      // Clean, descriptive filename
      const sanitizedName = (cleanSubpath ? `${repo}-${folderBaseName}` : repo)
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${sanitizedName}-${targetBranch.replace(/[^a-zA-Z0-9._-]/g, '_')}.zip`;

      this.onProgress({
        phase: 'completed',
        message: 'Download complete!',
        percent: 100,
        current: totalFiles,
        total: totalFiles,
        totalBytes
      });

      return {
        blob: zipBlob,
        filename,
        totalFiles,
        totalSize: totalBytes
      };
    }

    /**
     * Download a single file directly
     * @param {Object} params
     * @param {string} params.owner
     * @param {string} params.repo
     * @param {string} [params.branch]
     * @param {string} params.filePath
     * @returns {Promise<{blob: Blob, filename: string, size: number}>}
     */
    async downloadSingleFile({ owner, repo, branch = '', filePath }) {
      this.onProgress({
        phase: 'downloading',
        message: `Downloading ${filePath}...`,
        percent: 30,
        current: 0,
        total: 1
      });

      let targetBranch = branch;
      if (!targetBranch) {
        const repoInfo = await this.getRepoInfo(owner, repo);
        targetBranch = repoInfo.default_branch || 'main';
      }

      const content = await this.fetchFileContent(owner, repo, targetBranch, filePath, null, 3);
      const filename = filePath.split('/').pop() || 'download';
      const blob = new Blob([content]);

      this.onProgress({
        phase: 'completed',
        message: `Downloaded ${filename}!`,
        percent: 100,
        current: 1,
        total: 1
      });

      return {
        blob,
        filename,
        size: content.byteLength
      };
    }

    /**
     * Trigger browser file download from Blob or URL
     * @param {Blob|string} blobOrUrl
     * @param {string} filename
     */
    triggerBrowserDownload(blobOrUrl, filename) {
      const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        if (typeof blobOrUrl !== 'string') {
          URL.revokeObjectURL(url);
        }
      }, 2000);
    }
  }

  const api = {
    GitHubDownloader
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GitGrabEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
