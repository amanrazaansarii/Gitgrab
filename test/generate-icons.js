/**
 * Pure Node.js PNG generator for GitGrab extension icons
 * Generates clean green/dark-themed icons with GitHub/download motif.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, pixelFn) {
  // RGBA buffer (height rows, each row has 1 filter byte + width*4 RGBA bytes)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const offset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
      rawData[offset + 3] = a;
    }
  }

  // Deflate raw image data
  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // Deflate compression
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // No interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

// Pixel function drawing a modern rounded square with a download arrow motif
function renderIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.44; // radius of rounded bg

  // Normalized coordinates [-1, 1]
  const nx = (x - cx) / (w / 2);
  const ny = (y - cy) / (h / 2);

  // Rounded rectangle distance
  const cornerRadius = 0.35;
  const dx = Math.max(0, Math.abs(nx) - (1 - cornerRadius));
  const dy = Math.max(0, Math.abs(ny) - (1 - cornerRadius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > cornerRadius) {
    return [0, 0, 0, 0]; // Transparent background outside rounded rect
  }

  // Smooth anti-aliased edge
  let alpha = 255;
  if (dist > cornerRadius - 0.05) {
    alpha = Math.floor(255 * (1 - (dist - (cornerRadius - 0.05)) / 0.05));
  }

  // Background gradient (GitHub green #238636 to #2ea043)
  const grad = (ny + 1) / 2;
  let bgR = Math.floor(35 * (1 - grad) + 46 * grad);
  let bgG = Math.floor(134 * (1 - grad) + 160 * grad);
  let bgB = Math.floor(54 * (1 - grad) + 67 * grad);

  // Draw Download Arrow & Tray in white
  // Center arrow stem
  const stemWidth = 0.18;
  const stemTop = -0.55;
  const stemBottom = 0.08;

  const isStem = Math.abs(nx) <= stemWidth && ny >= stemTop && ny <= stemBottom;

  // Arrow head triangle
  const arrowBaseY = 0.08;
  const arrowTipY = 0.42;
  const arrowSpread = 0.46;
  const inArrowHead = ny >= arrowBaseY && ny <= arrowTipY &&
                      Math.abs(nx) <= (1 - (ny - arrowBaseY) / (arrowTipY - arrowBaseY)) * arrowSpread;

  // Bottom Tray line
  const trayY = 0.58;
  const trayThickness = 0.12;
  const trayWidth = 0.55;
  const inTray = ny >= trayY && ny <= (trayY + trayThickness) && Math.abs(nx) <= trayWidth;

  if (isStem || inArrowHead || inTray) {
    return [255, 255, 255, alpha]; // Crisp white icon
  }

  return [bgR, bgG, bgB, alpha];
}

// Generate sizes
const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
  const pngBuf = createPNG(size, size, renderIcon);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`✔ Generated ${outPath} (${size}x${size}, ${pngBuf.length} bytes)`);
}

console.log('\nAll icons generated successfully! ✨');
