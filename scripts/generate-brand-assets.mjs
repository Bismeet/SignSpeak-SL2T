import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// PNG chunk CRC table & calculation
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(width, height, rgbaBuffer) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = [];
  for (let y = 0; y < height; y++) {
    scanlines.push(Buffer.from([0])); // filter 0
    scanlines.push(rgbaBuffer.subarray(y * width * 4, (y + 1) * width * 4));
  }
  const compressed = zlib.deflateSync(Buffer.concat(scanlines), { level: 9 });
  return Buffer.concat([
    header,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePng(buf) {
  let offset = 8;
  const chunks = [];
  let width = 0;
  let height = 0;

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
    } else if (type === 'IDAT') {
      chunks.push(buf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }

  const decompressed = zlib.inflateSync(Buffer.concat(chunks));
  const bpp = 4;
  const raw = Buffer.alloc(width * height * 4);
  let srcPos = 0;

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    for (let x = 0; x < width * bpp; x++) {
      const rawByte = decompressed[srcPos++];
      let prev = 0;
      if (filter === 1) prev = x >= bpp ? raw[y * width * bpp + x - bpp] : 0;
      else if (filter === 2) prev = y > 0 ? raw[(y - 1) * width * bpp + x] : 0;
      raw[y * width * bpp + x] = (rawByte + prev) & 0xff;
    }
  }
  return { width, height, data: raw };
}

// Area-averaging downsampler for superior antialiasing and preservation of thin lines
function resampleArea(srcData, srcW, srcH, dstW, dstH, boostAlpha = false) {
  const dstData = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const yStart = dy * yRatio;
    const yEnd = (dy + 1) * yRatio;
    for (let dx = 0; dx < dstW; dx++) {
      const xStart = dx * xRatio;
      const xEnd = (dx + 1) * xRatio;

      let totalWeight = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      const yMin = Math.floor(yStart);
      const yMax = Math.min(srcH - 1, Math.floor(yEnd));
      const xMin = Math.floor(xStart);
      const xMax = Math.min(srcW - 1, Math.floor(xEnd));

      for (let sy = yMin; sy <= yMax; sy++) {
        const yTop = Math.max(sy, yStart);
        const yBottom = Math.min(sy + 1, yEnd);
        const yFrac = Math.max(0, yBottom - yTop);

        for (let sx = xMin; sx <= xMax; sx++) {
          const xLeft = Math.max(sx, xStart);
          const xRight = Math.min(sx + 1, xEnd);
          const xFrac = Math.max(0, xRight - xLeft);

          const weight = yFrac * xFrac;
          if (weight <= 0) continue;

          const idx = (sy * srcW + sx) * 4;
          let a = srcData[idx + 3] / 255;
          if (boostAlpha && a > 0) {
            a = Math.min(1, Math.pow(a, 0.72));
          }

          rSum += srcData[idx] * a * weight;
          gSum += srcData[idx + 1] * a * weight;
          bSum += srcData[idx + 2] * a * weight;
          aSum += a * weight;
          totalWeight += weight;
        }
      }

      const dIdx = (dy * dstW + dx) * 4;
      if (totalWeight > 0 && aSum > 0) {
        const normA = aSum / totalWeight;
        dstData[dIdx] = Math.min(255, Math.round(rSum / aSum));
        dstData[dIdx + 1] = Math.min(255, Math.round(gSum / aSum));
        dstData[dIdx + 2] = Math.min(255, Math.round(bSum / aSum));
        dstData[dIdx + 3] = Math.min(255, Math.round(normA * 255));
      }
    }
  }
  return dstData;
}

// Windows ICO format builder (stores PNG streams for crisp multi-resolution icon)
function makeIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4); // count

  let offset = 6 + count * 16;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

// Generate squircle (rounded badge) image
function makeSquircle(artData, artW, artH, size = 512, innerScale = 0.8) {
  const buf = Buffer.alloc(size * size * 4);
  const rInner = Math.round(size * 0.22); // iOS squircle-style smooth corner

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = Math.max(0, Math.max(rInner - x, x - (size - 1 - rInner)));
      const dy = Math.max(0, Math.max(rInner - y, y - (size - 1 - rInner)));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rInner + 1) {
        buf[idx + 3] = 0;
      } else {
        let a = 1;
        if (dist > rInner - 1) {
          a = Math.min(1, Math.max(0, (rInner + 1 - dist) / 2));
        }
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = Math.round(a * 255);
      }
    }
  }

  const artSize = Math.round(size * innerScale);
  const artResized = resampleArea(artData, artW, artH, artSize, artSize);
  const offset = Math.floor((size - artSize) / 2);

  for (let y = 0; y < artSize; y++) {
    for (let x = 0; x < artSize; x++) {
      const aIdx = (y * artSize + x) * 4;
      const sIdx = ((y + offset) * size + (x + offset)) * 4;
      const artA = artResized[aIdx + 3] / 255;
      if (artA <= 0) continue;

      const bgA = buf[sIdx + 3] / 255;
      const outA = artA + bgA * (1 - artA);
      const r = (artResized[aIdx] * artA + buf[sIdx] * bgA * (1 - artA)) / outA;
      const g = (artResized[aIdx + 1] * artA + buf[sIdx + 1] * bgA * (1 - artA)) / outA;
      const b = (artResized[aIdx + 2] * artA + buf[sIdx + 2] * bgA * (1 - artA)) / outA;

      buf[sIdx] = Math.round(r);
      buf[sIdx + 1] = Math.round(g);
      buf[sIdx + 2] = Math.round(b);
      buf[sIdx + 3] = Math.round(outA * 255);
    }
  }
  return buf;
}

export function generateAssets() {
  const uploadedPath = 'C:/Users/bisme/.gemini/antigravity/brain/e3a472d0-6d78-49f5-b515-ec598676a102/.user_uploaded/media_1789842360225.png';
  if (!fs.existsSync(uploadedPath)) {
    throw new Error(`Input image not found: ${uploadedPath}`);
  }

  console.log('Decoding source image...');
  const { width, height, data } = decodePng(fs.readFileSync(uploadedPath));

  // Find tight bounding box of the non-white ink
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r < 235 || g < 235 || b < 235) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const cropSize = 880; // balanced framing preserving all artwork edges with clean margin
  const x0 = cx - Math.floor(cropSize / 2);
  const y0 = cy - Math.floor(cropSize / 2);

  const transparentMaster = Buffer.alloc(cropSize * cropSize * 4);
  const darkMaster = Buffer.alloc(cropSize * cropSize * 4);

  for (let dy = 0; dy < cropSize; dy++) {
    const sy = y0 + dy;
    for (let dx = 0; dx < cropSize; dx++) {
      const sx = x0 + dx;
      const destIdx = (dy * cropSize + dx) * 4;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
        transparentMaster[destIdx + 3] = 0;
        darkMaster[destIdx + 3] = 0;
        continue;
      }

      const srcIdx = (sy * width + sx) * 4;
      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum >= 250) {
        transparentMaster[destIdx + 3] = 0;
        darkMaster[destIdx + 3] = 0;
      } else {
        const alphaNorm = Math.min(1, Math.max(0, (250 - lum) / 200));
        const a = Math.round(alphaNorm * 255);
        const invA = 1 - alphaNorm;

        // Unmix white to preserve natural ink tones
        const rClean = Math.min(255, Math.max(10, Math.round((r - invA * 255) / alphaNorm)));
        const gClean = Math.min(255, Math.max(25, Math.round((g - invA * 255) / alphaNorm)));
        const bClean = Math.min(255, Math.max(80, Math.round((b - invA * 255) / alphaNorm)));

        transparentMaster[destIdx] = rClean;
        transparentMaster[destIdx + 1] = gClean;
        transparentMaster[destIdx + 2] = bClean;
        transparentMaster[destIdx + 3] = a;

        // Dark theme: crisp clinical medical blue tone (#d8e4ff)
        darkMaster[destIdx] = 216;
        darkMaster[destIdx + 1] = 228;
        darkMaster[destIdx + 2] = 255;
        darkMaster[destIdx + 3] = a;
      }
    }
  }

  console.log('Generating multi-resolution PNGs...');
  const light512 = resampleArea(transparentMaster, cropSize, cropSize, 512, 512);
  const dark512 = resampleArea(darkMaster, cropSize, cropSize, 512, 512);
  const light192 = resampleArea(transparentMaster, cropSize, cropSize, 192, 192);

  // Favicon sizes (with alpha boosting for extra clarity at tiny sizes)
  const fav48 = resampleArea(transparentMaster, cropSize, cropSize, 48, 48, true);
  const fav32 = resampleArea(transparentMaster, cropSize, cropSize, 32, 32, true);
  const fav16 = resampleArea(transparentMaster, cropSize, cropSize, 16, 16, true);

  // Squircle icon for Apple touch icon (180x180)
  const squircle180 = makeSquircle(transparentMaster, cropSize, cropSize, 180, 0.82);

  const light512Png = encodePng(512, 512, light512);
  const dark512Png = encodePng(512, 512, dark512);
  const light192Png = encodePng(192, 192, light192);
  const fav48Png = encodePng(48, 48, fav48);
  const fav32Png = encodePng(32, 32, fav32);
  const fav16Png = encodePng(16, 16, fav16);
  const appleTouchPng = encodePng(180, 180, squircle180);

  // Build multi-size favicon.ico
  console.log('Generating favicon.ico...');
  const icoBuffer = makeIco([fav16Png, fav32Png, fav48Png], [16, 32, 48]);

  // Build responsive SVG icon with dark mode support
  console.log('Generating responsive icon.svg...');
  const lightBase64 = light512Png.toString('base64');
  const darkBase64 = dark512Png.toString('base64');

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SignSpeak">
  <style>
    .brand-light { display: block; }
    .brand-dark { display: none; }
    @media (prefers-color-scheme: dark) {
      .brand-light { display: none; }
      .brand-dark { display: block; }
    }
  </style>
  <image class="brand-light" href="data:image/png;base64,${lightBase64}" width="512" height="512" />
  <image class="brand-dark" href="data:image/png;base64,${darkBase64}" width="512" height="512" />
</svg>
`;

  // Write files to public/
  const publicDir = path.join(rootDir, 'public');
  fs.writeFileSync(path.join(publicDir, 'logo.png'), light512Png);
  fs.writeFileSync(path.join(publicDir, 'logo-dark.png'), dark512Png);
  fs.writeFileSync(path.join(publicDir, 'icon.png'), light512Png);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), light192Png);
  fs.writeFileSync(path.join(publicDir, 'apple-icon.png'), appleTouchPng);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchPng);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);

  console.log('All brand assets successfully generated in public/!');
}

generateAssets();
