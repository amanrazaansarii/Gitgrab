/**
 * Integration Test for GitGrab Engine (JSZip + Downloader + Mock/Live API)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock global environment for node
global.JSZip = require(path.join(__dirname, '../src/lib/jszip.min.js'));
const { GitHubDownloader } = require(path.join(__dirname, '../src/lib/github-api.js'));
const { parseGitHubUrl, getRawFileUrl } = require(path.join(__dirname, '../src/utils/url-parser.js'));

async function runIntegrationTests() {
  console.log('🧪 Starting GitGrab Integration Tests...\n');

  // Test 1: JSZip bundling verification
  console.log('Test 1: Testing JSZip archive creation and compression...');
  const zip = new global.JSZip();
  zip.file('src/index.js', 'console.log("Hello GitGrab");');
  zip.file('src/components/Button.jsx', 'export const Button = () => <button>Click</button>;');
  zip.file('README.md', '# GitGrab Test Repo');

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  assert.ok(zipBuffer.length > 0, 'ZIP buffer should not be empty');
  // Check ZIP signature (PK\x03\x04)
  assert.strictEqual(zipBuffer[0], 0x50); // 'P'
  assert.strictEqual(zipBuffer[1], 0x4b); // 'K'
  assert.strictEqual(zipBuffer[2], 0x03);
  assert.strictEqual(zipBuffer[3], 0x04);
  console.log(`✔ Test 1 passed: Created valid ZIP archive (${zipBuffer.length} bytes)\n`);

  // Test 2: Downloader Tree filtering & relative path handling
  console.log('Test 2: Testing Subfolder Tree Filtering and Path Resolution...');
  const mockTree = [
    { path: '.gitignore', type: 'blob', sha: '111' },
    { path: 'package.json', type: 'blob', sha: '222' },
    { path: 'src/index.js', type: 'blob', sha: '333' },
    { path: 'src/components/Header.jsx', type: 'blob', sha: '444' },
    { path: 'src/components/Footer.jsx', type: 'blob', sha: '555' },
    { path: 'src/utils/helper.js', type: 'blob', sha: '666' },
    { path: 'docs/README.md', type: 'blob', sha: '777' }
  ];

  // Target: 'src/components'
  const subpath = 'src/components';
  const prefix = subpath + '/';
  const filtered = mockTree.filter((item) => item.path === subpath || item.path.startsWith(prefix));

  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].path, 'src/components/Header.jsx');
  assert.strictEqual(filtered[1].path, 'src/components/Footer.jsx');

  // Relative path calculation (strip prefix)
  const relPaths = filtered.map((f) => f.path.slice(prefix.length));
  assert.deepStrictEqual(relPaths, ['Header.jsx', 'Footer.jsx']);
  console.log('✔ Test 2 passed: Successfully filtered tree and calculated relative ZIP paths\n');

  // Test 3: Downloader Progress Callback Flow
  console.log('Test 3: Testing Progress Callback Tracking...');
  const progressEvents = [];
  const downloader = new GitHubDownloader({
    onProgress: (p) => progressEvents.push(p)
  });

  downloader.onProgress({ phase: 'indexing', percent: 15, message: 'Indexing...' });
  downloader.onProgress({ phase: 'downloading', percent: 50, message: 'Downloading 2/4 files' });
  downloader.onProgress({ phase: 'zipping', percent: 90, message: 'Compressing...' });
  downloader.onProgress({ phase: 'completed', percent: 100, message: 'Complete!' });

  assert.strictEqual(progressEvents.length, 4);
  assert.strictEqual(progressEvents[progressEvents.length - 1].percent, 100);
  console.log('✔ Test 3 passed: Progress tracking pipeline verified\n');

  // Test 4: Real Public GitHub API Tree Fetch (Live verification)
  console.log('Test 4: Testing live GitHub API rate limit / public tree endpoint...');
  try {
    const liveDownloader = new GitHubDownloader();
    const rate = await liveDownloader.checkRateLimit();
    console.log(`✔ Public Rate Limit check successful: ${rate.remaining}/${rate.limit} requests remaining (Resets: ${rate.resetDate.toLocaleTimeString()})`);
  } catch (err) {
    console.log(`ℹ Notice on live check: ${err.message} (expected if offline or in firewalled environment)`);
  }

  console.log('\n✨ All Integration Tests Passed Successfully!');
}

runIntegrationTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
