/**
 * Test script for URL Parser and GitHub Downloader logic
 */

const assert = require('assert');
const urlParser = require('../src/utils/url-parser.js');

console.log('Testing GitHub URL Parser...');

// Test 1: Repo root
const repo1 = urlParser.parseGitHubUrl('https://github.com/facebook/react');
assert.strictEqual(repo1.owner, 'facebook');
assert.strictEqual(repo1.repo, 'react');
assert.strictEqual(repo1.isRepoRoot, true);
assert.strictEqual(repo1.isFolder, true);
assert.strictEqual(repo1.isFile, false);
console.log('✔ Test 1: Repo root URL passed');

// Test 2: Subfolder tree
const tree1 = urlParser.parseGitHubUrl('https://github.com/facebook/react/tree/main/packages/react-dom');
assert.strictEqual(tree1.owner, 'facebook');
assert.strictEqual(tree1.repo, 'react');
assert.strictEqual(tree1.branch, 'main');
assert.strictEqual(tree1.path, 'packages/react-dom');
assert.strictEqual(tree1.targetName, 'react-dom');
assert.strictEqual(tree1.isFolder, true);
assert.strictEqual(tree1.isFile, false);
console.log('✔ Test 2: Subfolder tree URL passed');

// Test 3: Blob file
const blob1 = urlParser.parseGitHubUrl('https://github.com/facebook/react/blob/main/packages/react/index.js');
assert.strictEqual(blob1.owner, 'facebook');
assert.strictEqual(blob1.repo, 'react');
assert.strictEqual(blob1.branch, 'main');
assert.strictEqual(blob1.path, 'packages/react/index.js');
assert.strictEqual(blob1.targetName, 'index.js');
assert.strictEqual(blob1.isFile, true);
assert.strictEqual(blob1.isFolder, false);
console.log('✔ Test 3: Blob file URL passed');

// Test 4: SSH and .git URLs
const git1 = urlParser.parseGitHubUrl('git@github.com:torvalds/linux.git');
assert.strictEqual(git1.owner, 'torvalds');
assert.strictEqual(git1.repo, 'linux');
assert.strictEqual(git1.isRepoRoot, true);
console.log('✔ Test 4: Git SSH / .git URL passed');

// Test 5: Raw and archive URLs
const rawUrl = urlParser.getRawFileUrl('owner', 'repo', 'main', 'src/index.ts');
assert.strictEqual(rawUrl, 'https://raw.githubusercontent.com/owner/repo/main/src/index.ts');

const archiveUrl = urlParser.getArchiveUrl('owner', 'repo', 'v1.2.3');
assert.strictEqual(archiveUrl, 'https://github.com/owner/repo/archive/refs/heads/v1.2.3.zip');
console.log('✔ Test 5: Raw and Archive helper URLs passed');

console.log('\nAll URL Parser tests passed successfully! ✨');
