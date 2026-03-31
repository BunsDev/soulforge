import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { inflateSync } from "node:zlib";

// ── Terminal capability detection ──

/** Check if the terminal supports truecolor (24-bit) — needed for image art. */
export function canRenderImages(): boolean {
  const colorterm = process.env.COLORTERM?.toLowerCase() ?? "";
  if (colorterm === "truecolor" || colorterm === "24bit") return true;
  const term = process.env.TERM_PROGRAM?.toLowerCase() ?? "";
  // Known truecolor terminals
  return !!(
    process.env.KITTY_WINDOW_ID ||
    term === "kitty" ||
    term === "ghostty" ||
    process.env.WEZTERM_PANE !== undefined ||
    term === "wezterm" ||
    process.env.ITERM_SESSION_ID ||
    term === "iterm.app" ||
    term === "iterm2" ||
    term === "hyper" ||
    term === "alacritty"
  );
}

// ── Image file validation ──

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp"]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function isRenderableImage(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return false;
  try {
    const stat = statSync(filePath);
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_IMAGE_SIZE;
  } catch {
    return false;
  }
}

// ── PNG decoder (pure JS, no dependencies) ──

interface PngData {
  width: number;
  height: number;
  pixels: Buffer; // RGB, 3 bytes per pixel
}

function decodePng(data: Buffer): PngData | null {
  // Verify PNG signature
  if (data.length < 24) return null;
  if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < data.length) {
    const len = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkData = data.subarray(offset + 8, offset + 8 + len);

    if (type === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8] ?? 8;
      colorType = chunkData[9] ?? 2;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(chunkData));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + len;
  }

  if (width === 0 || height === 0 || bitDepth !== 8) return null;
  if (colorType !== 2 && colorType !== 6) return null; // Only RGB and RGBA

  const bpp = colorType === 2 ? 3 : 4;
  const rowBytes = width * bpp;

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  // Unfilter rows (PNG filter types 0-4)
  const pixels = Buffer.alloc(width * height * 3);

  // Working buffer for current and previous row (unfiltered)
  const curRow = Buffer.alloc(rowBytes);
  const prevRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (rowBytes + 1)] ?? 0;
    const srcStart = y * (rowBytes + 1) + 1;

    // Copy raw scanline into curRow
    raw.copy(curRow, 0, srcStart, srcStart + rowBytes);

    // Apply filter
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? (curRow[x - bpp] ?? 0) : 0; // left
      const b = prevRow[x] ?? 0; // above
      const c = x >= bpp ? (prevRow[x - bpp] ?? 0) : 0; // upper-left
      const raw_x = curRow[x] ?? 0;

      switch (filterType) {
        case 0: // None
          break;
        case 1: // Sub
          curRow[x] = (raw_x + a) & 0xff;
          break;
        case 2: // Up
          curRow[x] = (raw_x + b) & 0xff;
          break;
        case 3: // Average
          curRow[x] = (raw_x + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: {
          // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          curRow[x] = (raw_x + pr) & 0xff;
          break;
        }
      }
    }

    // Extract RGB from unfiltered row
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 3;
      pixels[di] = curRow[si] ?? 0;
      pixels[di + 1] = curRow[si + 1] ?? 0;
      pixels[di + 2] = curRow[si + 2] ?? 0;
    }

    // Save current row as previous for next iteration
    curRow.copy(prevRow);
  }

  return { width, height, pixels };
}

// ── Half-block art generator ──

/** Default display width in terminal columns. */
const DEFAULT_COLS = 120;
const MAX_COLS = 200;

/**
 * Sample a rectangular region of the image using area averaging.
 * Returns [r, g, b] averaged over all pixels in the region.
 */
function sampleArea(
  pixels: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] {
  const sx0 = Math.max(0, Math.floor(x0));
  const sy0 = Math.max(0, Math.floor(y0));
  const sx1 = Math.min(width, Math.ceil(x1));
  const sy1 = Math.min(height, Math.ceil(y1));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = sy0; y < sy1; y++) {
    for (let x = sx0; x < sx1; x++) {
      const i = (y * width + x) * 3;
      rSum += pixels[i] ?? 0;
      gSum += pixels[i + 1] ?? 0;
      bSum += pixels[i + 2] ?? 0;
      count++;
    }
  }

  if (count === 0) return [0, 0, 0];
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}

/**
 * Convert a PNG image to half-block ANSI art.
 * Uses ▀ (upper half block) with fg = top pixel, bg = bottom pixel
 * for 2x vertical resolution. Uses area-average downsampling for
 * much better quality than nearest-neighbor.
 *
 * Returns an array of ANSI-colored strings, one per display row.
 */
export function imageToHalfBlockArt(filePath: string, opts?: { cols?: number }): string[] | null {
  if (!isRenderableImage(filePath)) return null;

  let png: PngData | null;
  try {
    const data = readFileSync(filePath);
    png = decodePng(data);
  } catch {
    return null;
  }
  if (!png) return null;

  const targetCols = Math.min(opts?.cols ?? DEFAULT_COLS, MAX_COLS);
  const scaleX = png.width / targetCols;
  // Each display row covers 2 pixel rows (top half + bottom half)
  const scaleY = scaleX; // Keep aspect ratio square per cell
  const scaledHeight = Math.ceil(png.height / scaleY);
  // Round up to even number for half-block pairing
  const targetRows = scaledHeight + (scaledHeight % 2);

  const lines: string[] = [];

  for (let cy = 0; cy < targetRows; cy += 2) {
    let line = "";
    for (let cx = 0; cx < targetCols; cx++) {
      // Area-average the source pixels that map to this cell
      const srcX0 = cx * scaleX;
      const srcX1 = (cx + 1) * scaleX;
      const srcY1_top = cy * scaleY;
      const srcY1_bot = (cy + 1) * scaleY;
      const srcY2_top = (cy + 1) * scaleY;
      const srcY2_bot = (cy + 2) * scaleY;

      const [r1, g1, b1] = sampleArea(
        png.pixels,
        png.width,
        png.height,
        srcX0,
        srcY1_top,
        srcX1,
        srcY1_bot,
      );
      const [r2, g2, b2] = sampleArea(
        png.pixels,
        png.width,
        png.height,
        srcX0,
        srcY2_top,
        srcX1,
        srcY2_bot,
      );

      // ▀ = upper half block: fg = top pixel, bg = bottom pixel
      line += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m▀`;
    }
    line += "\x1b[0m";
    lines.push(line);
  }

  return lines;
}

/** Result from rendering images. */
export interface ImageArtResult {
  rendered: string[];
  arts: Array<{ name: string; lines: string[] }>;
}

/**
 * Render images as half-block ANSI art.
 * Called by the shell tool when `outputImages` is provided.
 *
 * Returns rendered filenames and ANSI art lines for each image.
 * The React component renders the art as <text> elements in the chat.
 */
export function renderImages(paths: string[], cwd?: string): ImageArtResult {
  if (!canRenderImages()) return { rendered: [], arts: [] };
  if (paths.length === 0) return { rendered: [], arts: [] };

  const rendered: string[] = [];
  const arts: ImageArtResult["arts"] = [];

  for (const p of paths) {
    const resolved = resolve(cwd ?? process.cwd(), p);
    const lines = imageToHalfBlockArt(resolved);
    if (lines) {
      const name = basename(p);
      rendered.push(name);
      arts.push({ name, lines });
    }
  }

  return { rendered, arts };
}
