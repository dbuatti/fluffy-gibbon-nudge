/**
 * Image compliance helpers for release platforms.
 *
 * Insight Timer requires artwork to be at least 1600×1600 px and at most
 * 20 MB. FLUX.1 Schnell on Cloudflare hard-caps at 1024×1024 (it rejects
 * width/height params entirely), so AI images are upscaled client-side here
 * with stepwise high-quality smoothing before being saved or exported.
 * Abstract / atmospheric art upscales very cleanly with this approach.
 */

export const INSIGHT_TIMER_MIN_DIM = 1600;
export const INSIGHT_TIMER_MAX_BYTES = 20 * 1024 * 1024;
/** Square export size for release covers — comfortably above every platform minimum. */
export const RELEASE_EXPORT_SIZE = 3000;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function drawScaled(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, dw, dh);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))), type, quality);
  });
}

/** Current dimensions of a blob, without keeping it in memory as an <img> in the DOM. */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await loadImage(blob);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Guarantee both dimensions are at least `minDim` by upscaling (aspect ratio
 * preserved). Returns the original blob untouched when already large enough.
 * Upscales in ≤1.5× steps with high-quality smoothing to avoid the blockiness
 * of a single large drawImage call.
 */
export async function upscaleToMinSize(
  blob: Blob,
  minDim: number = INSIGHT_TIMER_MIN_DIM,
  opts: { type?: string; quality?: number } = {},
): Promise<Blob> {
  const img = await loadImage(blob);
  let cw = img.naturalWidth;
  let ch = img.naturalHeight;
  if (Math.min(cw, ch) >= minDim) return blob;

  let current: CanvasImageSource = img;
  // Stepwise growth while another full 1.5× jump stays under the target
  while (Math.min(cw, ch) * 1.5 < minDim) {
    const nw = Math.round(cw * 1.5);
    const nh = Math.round(ch * 1.5);
    current = drawScaled(current, cw, ch, nw, nh);
    cw = nw;
    ch = nh;
  }
  // Final exact step
  const scale = minDim / Math.min(cw, ch);
  const fw = Math.round(cw * scale);
  const fh = Math.round(ch * scale);
  const canvas = drawScaled(current, cw, ch, fw, fh);
  return encode(canvas, opts.type ?? 'image/jpeg', opts.quality ?? 0.92);
}

/**
 * Center-crop to a square and upscale to exactly `size`×`size` — the format
 * release platforms (Insight Timer, DistroKid, streaming services) expect for
 * cover art. Always returns a high-quality JPEG.
 */
export async function toSquareExport(blob: Blob, size: number = RELEASE_EXPORT_SIZE): Promise<Blob> {
  const img = await loadImage(blob);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  // Crop to square at native resolution first (via a temp canvas), then
  // upscale in steps — keeps the crop centered and the upscale clean.
  let current: CanvasImageSource = drawCrop(img, sx, sy, side, side);
  let cs = side;
  while (cs * 1.5 < size) {
    const n = Math.round(cs * 1.5);
    current = drawScaled(current, cs, cs, n, n);
    cs = n;
  }
  const scale = size / cs;
  const finalSize = Math.round(cs * scale);
  const canvas = drawScaled(current, cs, cs, finalSize, finalSize);
  return encode(canvas, 'image/jpeg', 0.92);
}

function drawCrop(img: HTMLImageElement, sx: number, sy: number, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return canvas;
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Human-readable dimensions + size, e.g. "2000×2000 px · 1.2 MB". */
export function describeImage(blob: Blob, dims: { width: number; height: number }): string {
  const mb = (blob.size / (1024 * 1024)).toFixed(1);
  return `${dims.width}×${dims.height} px · ${mb} MB`;
}
