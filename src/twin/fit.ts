/**
 * Patient-specific calibration of the digital twin (inverse problem).
 *
 * Step 1 – haemodynamic personalisation: Nelder–Mead search in log-parameter space
 *          for LV contractility, systemic resistance and compliance, stressed blood
 *          volume and prosthetic EOA / regurgitant orifice, minimising the
 *          normalised squared error against measured echo / cuff values.
 * Step 2 – prognostic personalisation: given serial follow-up mean gradients, fit the
 *          individual time-to-severe-deterioration T (golden-section search) and
 *          forecast when VARC-3 Stage 2 and 3 would be reached.
 */

import { Haemodynamics, TwinParams, TwinState, simulate } from "./model";
import { WEIBULL_K, valveFromDamage, withValve } from "./lifetime";

export interface Measurements {
  hr: number;
  sbp?: number;
  dbp?: number;
  ef?: number;
  edv?: number;
  meanGradient?: number;
  eoa?: number;
  arRF?: number;
}

export const MEASUREMENT_SCALE: Record<keyof Omit<Measurements, "hr">, number> = {
  sbp: 4,
  dbp: 4,
  ef: 3,
  edv: 8,
  meanGradient: 1.5,
  eoa: 0.08,
  arRF: 4,
};

const SIM_KEY: Record<keyof Omit<Measurements, "hr">, keyof Haemodynamics> = {
  sbp: "sbp",
  dbp: "dbp",
  ef: "ef",
  edv: "edv",
  meanGradient: "avMeanGradient",
  eoa: "avGorlinEOA",
  arRF: "arRF",
};

interface ParamDef {
  name: string;
  get: (p: TwinParams) => number;
  set: (p: TwinParams, v: number) => TwinParams;
  lo: number;
  hi: number;
}

export const FIT_PARAMS: ParamDef[] = [
  { name: "LV Ees (mmHg/mL)", get: (p) => p.emaxLV, set: (p, v) => ({ ...p, emaxLV: v }), lo: 0.4, hi: 6 },
  { name: "R_sys (mmHg·s/mL)", get: (p) => p.rSys, set: (p, v) => ({ ...p, rSys: v }), lo: 0.4, hi: 2.5 },
  { name: "C_art (mL/mmHg)", get: (p) => p.cSa, set: (p, v) => ({ ...p, cSa: v }), lo: 0.3, hi: 4 },
  { name: "Stressed volume (mL)", get: (p) => p.stressedVolume, set: (p, v) => ({ ...p, stressedVolume: v }), lo: 350, hi: 1400 },
  { name: "Valve EOA (cm²)", get: (p) => p.aortic.eoaMax, set: (p, v) => ({ ...p, aortic: { ...p.aortic, eoaMax: v } }), lo: 0.35, hi: 3.5 },
  { name: "Regurgitant orifice (cm²)", get: (p) => p.aortic.roa + 0.002, set: (p, v) => ({ ...p, aortic: { ...p.aortic, roa: Math.max(0, v - 0.002) } }), lo: 0.002, hi: 0.6 },
];

function toX(p: TwinParams, defs: ParamDef[]) {
  return defs.map((d) => Math.log(d.get(p)));
}

function fromX(base: TwinParams, x: number[], defs: ParamDef[]) {
  let p = base;
  defs.forEach((d, i) => {
    const v = Math.min(d.hi, Math.max(d.lo, Math.exp(x[i])));
    p = d.set(p, v);
  });
  return p;
}

export function residuals(h: Haemodynamics, m: Measurements) {
  const out: { key: string; measured: number; simulated: number; z: number }[] = [];
  (Object.keys(SIM_KEY) as (keyof typeof SIM_KEY)[]).forEach((k) => {
    const mv = m[k];
    if (mv === undefined || Number.isNaN(mv)) return;
    const sv = h[SIM_KEY[k]] as number;
    out.push({ key: k, measured: mv, simulated: sv, z: (sv - mv) / MEASUREMENT_SCALE[k] });
  });
  return out;
}

export interface FitProgress {
  iter: number;
  evals: number;
  cost: number;
}

export interface FitResult {
  params: TwinParams;
  haemo: Haemodynamics;
  cost: number;
  evals: number;
  residuals: ReturnType<typeof residuals>;
  history: number[];
}

/**
 * Nelder–Mead (Lagarias et al. 1998 coefficients). Async so the UI stays responsive.
 */
export async function calibrate(
  start: TwinParams,
  m: Measurements,
  onProgress?: (p: FitProgress) => void,
  maxEvals = 400
): Promise<FitResult> {
  const defs = FIT_PARAMS.filter((d) => {
    if (d.name.startsWith("Regurgitant")) return m.arRF !== undefined;
    if (d.name.startsWith("Valve EOA")) return m.meanGradient !== undefined || m.eoa !== undefined;
    return true;
  });
  const base0: TwinParams = { ...start, hr: m.hr };
  let warm: TwinState | undefined;
  let evals = 0;
  const history: number[] = [];

  const cost = (x: number[]) => {
    const p = fromX(base0, x, defs);
    const r = simulate(p, warm, { tol: 0.4, maxBeats: 25 });
    warm = r.state;
    evals++;
    const res = residuals(r.haemo, m);
    // weak prior pulling towards start values keeps unidentifiable parameters sane
    const prior = x.reduce((acc, xi, i) => acc + 0.02 * (xi - Math.log(defs[i].get(base0))) ** 2, 0);
    return res.reduce((acc, e) => acc + e.z * e.z, 0) + prior;
  };

  const n = defs.length;
  const x0 = toX(base0, defs);
  let simplex: number[][] = [x0];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += 0.18;
    simplex.push(x);
  }
  let fs = simplex.map(cost);
  let iter = 0;
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  while (evals < maxEvals) {
    iter++;
    const order = fs.map((f, i) => [f, i] as const).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    fs = order.map(([f]) => f);
    history.push(fs[0]);
    if (iter % 3 === 0) {
      onProgress?.({ iter, evals, cost: fs[0] });
      await yieldUI();
    }
    if (fs[n] - fs[0] < 1e-4) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const along = (c: number) => centroid.map((cj, j) => cj + c * (simplex[n][j] - cj));

    const xr = along(-1);
    const fr = cost(xr);
    if (fr < fs[0]) {
      const xe = along(-2);
      const fe = cost(xe);
      if (fe < fr) {
        simplex[n] = xe;
        fs[n] = fe;
      } else {
        simplex[n] = xr;
        fs[n] = fr;
      }
    } else if (fr < fs[n - 1]) {
      simplex[n] = xr;
      fs[n] = fr;
    } else {
      const outside = fr < fs[n];
      const xc = along(outside ? -0.5 : 0.5);
      const fc = cost(xc);
      if (fc < (outside ? fr : fs[n])) {
        simplex[n] = xc;
        fs[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          fs[i] = cost(simplex[i]);
        }
      }
    }
  }
  const best = fs.indexOf(Math.min(...fs));
  const params = fromX(base0, simplex[best], defs);
  const final = simulate(params, undefined, { tol: 0.2 });
  onProgress?.({ iter, evals, cost: fs[best] });
  return {
    params,
    haemo: final.haemo,
    cost: fs[best],
    evals,
    residuals: residuals(final.haemo, m),
    history,
  };
}

export interface FollowUp {
  year: number;
  meanGradient: number;
}

export interface PrognosisResult {
  T: number;
  curve: { year: number; meanGradient: number }[];
  rmse: number;
}

/**
 * Fit the individual time-to-severe deterioration T to serial gradients, assuming the
 * damage law d = (t/T)^k and the twin's own damage -> gradient map.
 */
export function fitPrognosis(params: TwinParams, mode: number, data: FollowUp[], horizon = 25): PrognosisResult {
  const base = { eoa0: params.aortic.eoaMax, roa0: params.aortic.roa };
  // lookup table: damage -> mean gradient
  const dGrid: number[] = [];
  const gGrid: number[] = [];
  let warm: TwinState | undefined;
  for (let i = 0; i <= 28; i++) {
    const d = (i / 28) * 1.4;
    const { eoa, roa } = valveFromDamage(base, d, mode);
    const r = simulate(withValve(params, eoa, roa), warm, { tol: 0.5 });
    warm = r.state;
    dGrid.push(d);
    gGrid.push(r.haemo.avMeanGradient);
  }
  const gradOfD = (d: number) => {
    const dc = Math.min(1.4, Math.max(0, d));
    const i = Math.min(dGrid.length - 2, Math.floor((dc / 1.4) * 28));
    const f = (dc - dGrid[i]) / (dGrid[i + 1] - dGrid[i]);
    return gGrid[i] + f * (gGrid[i + 1] - gGrid[i]);
  };
  const predict = (T: number, t: number) => gradOfD(Math.pow(t / T, WEIBULL_K));
  const sse = (logT: number) => {
    const T = Math.exp(logT);
    return data.reduce((acc, p) => acc + (predict(T, p.year) - p.meanGradient) ** 2, 0);
  };
  // golden-section on log T in [ln 2, ln 80]
  let a = Math.log(2);
  let b = Math.log(80);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  for (let i = 0; i < 60; i++) {
    if (sse(c) < sse(d)) b = d;
    else a = c;
    c = b - gr * (b - a);
    d = a + gr * (b - a);
  }
  const T = Math.exp((a + b) / 2);
  const curve = [];
  for (let y = 0; y <= horizon; y += 0.5) curve.push({ year: y, meanGradient: predict(T, y) });
  const rmse = Math.sqrt(sse(Math.log(T)) / Math.max(1, data.length));
  return { T, curve, rmse };
}
