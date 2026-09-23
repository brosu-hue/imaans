// Device quality tiers. Every module reads ctx.q (never sniffs the device itself).
//  high — desktop / laptop with a real GPU
//  mid  — modern phones & tablets
//  low  — older / small phones (iPhone 8 class: 375x667, A11, 2 GB)

export const TIERS = {
  high: {
    name: 'high', maxDpr: 2.0, minDpr: 1.0, antialias: true,
    shadows: true, shadowType: 'pcfsoft', shadowMapSize: 2048, maxShadowLights: 2, maxLights: 8,
    bloom: true, bloomScale: 0.5, ao: true,
    particles: 1.0,     // multiplier on particle counts
    density: 1.0,       // multiplier on prop counts (garments per rail, shoes per shelf…)
    texMax: 2048, anisotropy: 8, envSize: 256,
  },
  mid: {
    name: 'mid', maxDpr: 1.6, minDpr: 0.85, antialias: true,
    shadows: true, shadowType: 'pcf', shadowMapSize: 1024, maxShadowLights: 1, maxLights: 6,
    bloom: true, bloomScale: 0.35, ao: false,
    particles: 0.6, density: 0.85, texMax: 1024, anisotropy: 4, envSize: 128,
  },
  low: {
    name: 'low', maxDpr: 1.25, minDpr: 0.75, antialias: true,
    shadows: false, shadowType: 'pcf', shadowMapSize: 1024, maxShadowLights: 0, maxLights: 4,
    bloom: false, bloomScale: 0.25, ao: false,
    // texMax 512: library + model textures above it are downscaled once at load (kit.capImage) — the phone
    // screen never resolves more than ~1 texel/px from them, and it saves ≈ 50 MB of GPU memory
    particles: 0.35, density: 0.65, texMax: 512, anisotropy: 2, envSize: 128,
  },
};

export function detectTier(params) {
  const forced = params.get('tier');
  if (forced && TIERS[forced]) return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mobile = coarse && (small || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent));
  if (!mobile) return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const px = screen.width * screen.height;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS Safari under-reports cores and hides deviceMemory, so only screen size identifies old iPhones.
  if (ios) return px <= 375 * 667 + 1 ? 'low' : 'mid'; // iPhone 6/7/8/SE2 → low
  if (cores <= 4 || mem <= 3) return 'low';
  return 'mid';
}

export function isMobileDevice() {
  return matchMedia('(pointer: coarse)').matches;
}
