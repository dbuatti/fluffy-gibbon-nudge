/**
 * Generative Art Engine — procedural abstract artwork via HTML Canvas.
 *
 * No external dependencies. Pure canvas rendering with seeded PRNG so
 * results are reproducible. Multiple techniques: flow fields, particles,
 * layered gradients, noise textures, geometric forms, organic shapes.
 */

export interface ArtParams {
  seed: number;
  palette: string[];        // hex colors
  complexity: number;       // 1-10
  flow: number;             // 0-1 (flow field strength)
  texture: number;          // 0-1 (grain/noise)
  contrast: number;         // 0-1
  organic: number;          // 0-1 (organic vs geometric)
  density: number;          // 1-10
  aspectRatio: '1:1' | '4:5' | '16:9' | '9:16';
  prompt?: string;          // optional text prompt (used as seed influence)
}

export const DEFAULT_PALETTE = ['#2c2416', '#4a3f2f', '#7a6b55', '#b8a88a', '#e8dcc8'];

export const PALETTES: Record<string, string[]> = {
  'Midnight Indigo': ['#0a0a1a', '#1a1a3e', '#2d2d6b', '#533483', '#e94560'],
  'Smoke & Gold': ['#1a1a1a', '#2d2d2d', '#4a4a4a', '#c9a96e', '#f5e6d3'],
  'Ocean Depth': ['#001220', '#003366', '#006699', '#3399cc', '#99ccff'],
  'Warm Ember': ['#1a0a00', '#3d1a00', '#8b3a00', '#d4620a', '#f5c842'],
  'Blush & Slate': ['#1a1520', '#3d2e4a', '#6b4c7a', '#d4a5c9', '#f5e0f0'],
  'Forest Mist': ['#0a1a10', '#1a3d2e', '#2d6b4f', '#6bc9a0', '#d3f0e0'],
  'Monochrome': ['#000000', '#333333', '#666666', '#999999', '#ffffff'],
  'Calming Earth': ['#2c2416', '#4a3f2f', '#7a6b55', '#b8a88a', '#e8dcc8'],
  'Soft Dawn': ['#1a1520', '#3d2840', '#6b4060', '#c9a0b0', '#f0d8e0'],
  'Gentle Ocean': ['#0a1520', '#1a2d40', '#3d5a7a', '#7a9ab8', '#c8dce8'],
};

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function createParams(overrides: Partial<ArtParams> = {}): ArtParams {
  const seed = overrides.seed ?? Math.floor(Math.random() * 1e9);
  return {
    seed,
    palette: overrides.palette ?? DEFAULT_PALETTE,
    complexity: overrides.complexity ?? 4,
    flow: overrides.flow ?? 0.4,
    texture: overrides.texture ?? 0.5,
    contrast: overrides.contrast ?? 0.4,
    organic: overrides.organic ?? 0.9,
    density: overrides.density ?? 3,
    aspectRatio: overrides.aspectRatio ?? '1:1',
    prompt: overrides.prompt,
  };
}

function getDimensions(ar: ArtParams['aspectRatio']): [number, number] {
  const base = 1024;
  switch (ar) {
    case '4:5': return [Math.round(base * 0.8), base];
    case '16:9': return [Math.round(base * 1.778), base];
    case '9:16': return [Math.round(base * 0.5625), base];
    default: return [base, base];
  }
}

// Simplex-like noise (multi-octave)
function noise2D(x: number, y: number, seed: number, octaves = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let o = 0; o < octaves; o++) {
    const n = Math.sin(x * 12.9898 * frequency + y * 78.233 * frequency + seed * (o + 1)) * 43758.5453;
    value += (n - Math.floor(n)) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

export function renderArt(canvas: HTMLCanvasElement, params: ArtParams): void {
  const [w, h] = getDimensions(params.aspectRatio);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rng = mulberry32(params.seed + (params.prompt ? hashString(params.prompt) : 0));
  const palette = params.palette;

  // Background gradient with more stops
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, palette[0]);
  grad.addColorStop(0.3, palette[1] || palette[0]);
  grad.addColorStop(0.7, palette[palette.length - 2] || palette[palette.length - 1]);
  grad.addColorStop(1, palette[palette.length - 1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Focal point glow
  const focalX = w * (0.3 + rng() * 0.4);
  const focalY = h * (0.3 + rng() * 0.4);
  const focalR = Math.min(w, h) * (0.3 + rng() * 0.2);
  const focalGrad = ctx.createRadialGradient(focalX, focalY, 0, focalX, focalY, focalR);
  focalGrad.addColorStop(0, palette[Math.floor(rng() * palette.length)] + '60');
  focalGrad.addColorStop(0.5, palette[Math.floor(rng() * palette.length)] + '20');
  focalGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = focalGrad;
  ctx.fillRect(0, 0, w, h);

  // Layered color fields
  const numFields = Math.round(params.complexity * 2);
  for (let i = 0; i < numFields; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.2 + rng() * 0.4) * Math.min(w, h);
    const color = palette[Math.floor(rng() * palette.length)];
    const alpha = 0.15 + rng() * 0.25;

    const radial = ctx.createRadialGradient(x, y, 0, x, y, r);
    radial.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
    radial.addColorStop(1, color + '00');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);
  }

  // Flow field particles with multi-octave noise
  if (params.flow > 0) {
    const numParticles = Math.round(params.density * 300);
    const steps = Math.round(params.complexity * 80);
    ctx.lineWidth = 0.3 + params.flow * 1.2;
    ctx.globalCompositeOperation = 'lighter';

    for (let p = 0; p < numParticles; p++) {
      let x = rng() * w;
      let y = rng() * h;
      const color = palette[Math.floor(rng() * palette.length)];
      const alpha = Math.round((0.3 + rng() * 0.4) * 255).toString(16).padStart(2, '0');
      ctx.strokeStyle = color + alpha;
      ctx.beginPath();
      ctx.moveTo(x, y);

      for (let s = 0; s < steps; s++) {
        const n = noise2D(x / 300, y / 300, params.seed, 4);
        const angle = n * Math.PI * 4 * params.flow;
        x += Math.cos(angle) * 1.5;
        y += Math.sin(angle) * 1.5;
        if (x < 0 || x > w || y < 0 || y > h) break;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Organic shapes
  if (params.organic > 0.3) {
    const numShapes = Math.round(params.organic * params.complexity * 3);
    for (let i = 0; i < numShapes; i++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const r = (0.05 + rng() * 0.15) * Math.min(w, h);
      const color = palette[Math.floor(rng() * palette.length)];
      const alpha = 0.1 + rng() * 0.2;

      ctx.beginPath();
      const points = 5 + Math.floor(rng() * 5);
      for (let j = 0; j <= points; j++) {
        const angle = (j / points) * Math.PI * 2;
        const radius = r * (0.6 + rng() * 0.8);
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }
  }

  // Geometric forms
  if (params.organic < 0.7) {
    const numGeo = Math.round((1 - params.organic) * params.complexity * 5);
    for (let i = 0; i < numGeo; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const size = (0.02 + rng() * 0.08) * Math.min(w, h);
      const color = palette[Math.floor(rng() * palette.length)];
      const alpha = 0.3 + rng() * 0.4;

      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      if (rng() > 0.5) {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Texture / grain
  if (params.texture > 0) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const grainAmount = params.texture * 40;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (rng() - 0.5) * grainAmount;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Vignette
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.min(w, h) * 0.8);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, type, quality);
  });
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename = 'generative-art.png'): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}