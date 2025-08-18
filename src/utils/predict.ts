// Simple linear regression + ETA to threshold
export function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return { m: 0, b: ys[0] ?? 0 };
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) * (x - mx), 0) || 1e-9;
  const m = num / den;
  const b = my - m * mx;
  return { m, b };
}

export function forecastSeries(xs: number[], ys: number[], steps = 12) {
  const { m, b } = linearFit(xs, ys);
  const last = xs[xs.length - 1] ?? 0;
  const outXs = Array.from({ length: steps }, (_, k) => last + (k + 1));
  const outYs = outXs.map(x => m * x + b);
  return { xs: outXs, ys: outYs, m, b };
}

export function etaToThreshold(xs: number[], ys: number[], threshold: number) {
  const { m, b } = linearFit(xs, ys);
  if (Math.abs(m) < 1e-9) return { steps: Infinity };
  const step = Math.ceil((threshold - b) / m);
  return { steps: step > 0 ? step : Infinity };
}