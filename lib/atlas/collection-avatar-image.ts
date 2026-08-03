import sharp from "sharp";

const MAX_PIXELS = 40_000_000;
const SAFE_NEUTRAL = "#5f7f9f";

type RGB = { r: number; g: number; b: number };
type Bucket = RGB & { count: number };

export async function processCollectionAvatarImage(
  input: Buffer | Uint8Array,
): Promise<{ bytes: Buffer; color: string }> {
  const image = sharp(Buffer.from(input), { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 512, height: 512, fit: "cover", position: "attention" });
  const [{ data }, bytes] = await Promise.all([
    image
      .clone()
      .resize({ width: 32, height: 32, fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    image.clone().webp({ quality: 86 }).toBuffer(),
  ]);

  return { bytes, color: dominantSafeColor(data) };
}

function dominantSafeColor(pixels: Buffer): string {
  const eligible: RGB[] = [];
  const visible: RGB[] = [];
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const pixel = { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
    visible.push(pixel);
    const luminance = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
    if (luminance >= 18 && luminance <= 237) eligible.push(pixel);
  }
  const source = eligible.length > 0 ? eligible : visible;
  if (source.length === 0) return SAFE_NEUTRAL;

  const buckets = new Map<number, Bucket>();
  for (const pixel of source) {
    const key = (pixel.r >> 4) << 8 | (pixel.g >> 4) << 4 | (pixel.b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return SAFE_NEUTRAL;
  return normalizedHex({
    r: dominant.r / dominant.count,
    g: dominant.g / dominant.count,
    b: dominant.b / dominant.count,
  });
}

function normalizedHex(rgb: RGB): string {
  const { h, s, l } = rgbToHsl(rgb);
  if (s < 0.12) return SAFE_NEUTRAL;
  const safe = hslToRgb({
    h,
    s: Math.max(0.35, s),
    l: Math.min(0.72, Math.max(0.3, l)),
  });
  return `#${[safe.r, safe.g, safe.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = snap(rgb.r) / 255;
  const g = snap(rgb.g) / 255;
  const b = snap(rgb.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: ((h * 60) + 360) % 360, s, l };
}

function hslToRgb(hsl: { h: number; s: number; l: number }): RGB {
  const c = (1 - Math.abs(2 * hsl.l - 1)) * hsl.s;
  const x = c * (1 - Math.abs((hsl.h / 60) % 2 - 1));
  const m = hsl.l - c / 2;
  let channels: [number, number, number];
  if (hsl.h < 60) channels = [c, x, 0];
  else if (hsl.h < 120) channels = [x, c, 0];
  else if (hsl.h < 180) channels = [0, c, x];
  else if (hsl.h < 240) channels = [0, x, c];
  else if (hsl.h < 300) channels = [x, 0, c];
  else channels = [c, 0, x];
  return {
    r: (channels[0] + m) * 255,
    g: (channels[1] + m) * 255,
    b: (channels[2] + m) * 255,
  };
}

function snap(value: number): number {
  if (value <= 4) return 0;
  if (value >= 251) return 255;
  return value;
}
