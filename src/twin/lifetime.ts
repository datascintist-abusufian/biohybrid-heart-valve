/**
 * Structural valve deterioration (SVD) over the lifetime of a biohybrid /
 * bioprosthetic aortic valve, coupled to the haemodynamic twin.
 *
 * Population layer
 *   Time to severe deterioration follows a Weibull law S(t) = exp(-(t/lambda)^k),
 *   k = 3, with an age-dependent scale lambda(age) = 20 * exp(0.0302 * (age - 51)) years.
 *   Calibrated to published freedom from reoperation for SVD:
 *     - age <= 60 (mean 51 y), Carpentier-Edwards Perimount: 88.3 / 70.8 / 38.1 %
 *       at 10 / 15 / 20 y (Bourguignon et al., Ann Thorac Surg 2015)
 *     - mean age 71 y, same valve: ~85 % free of SVD explant at 20 y
 *       (Johnston et al., Ann Thorac Surg 2015)
 *   Reoperation is a conservative proxy for reaching severe deterioration.
 *
 * Individual layer
 *   A patient at durability percentile p reaches severe deterioration at
 *   T_p = lambda * (-ln(1 - p))^(1/k). Damage accumulates as d(t) = (t / T_p)^k,
 *   so d = 1 at T_p. Damage reduces the open orifice (calcific stenosis) and/or opens
 *   a regurgitant orifice (leaflet tear), mixed by `mode`; the dominant mechanism
 *   reaches the VARC-3 Stage 3 range at d = 1.
 *
 * Biohybrid layer (hypothetical, labelled in the UI)
 *   `selfRepair` slows damage accrual (living-cell remodelling), and an
 *   AI-triggered repair policy can reverse a fraction of damage when surveillance
 *   detects a given VARC-3 stage.
 */

import {
  DEFAULT_PARAMS,
  Haemodynamics,
  TwinParams,
  TwinState,
  simulate,
  varc3Stage,
} from "./model";

export const WEIBULL_K = 3;

export function weibullScale(age: number) {
  return 20 * Math.exp(0.0302 * (age - 51));
}

export function freedomFromSVD(t: number, age: number, selfRepair = 0) {
  const lam = weibullScale(age) / Math.max(0.05, 1 - selfRepair);
  return Math.exp(-Math.pow(t / lam, WEIBULL_K));
}

export function individualT(age: number, percentile: number, selfRepair = 0) {
  const lam = weibullScale(age) / Math.max(0.05, 1 - selfRepair);
  const p = Math.min(0.995, Math.max(0.005, percentile));
  return lam * Math.pow(-Math.log(1 - p), 1 / WEIBULL_K);
}

/** Inverse: which cohort percentile corresponds to a time-to-severe T. */
export function percentileOfT(age: number, T: number, selfRepair = 0) {
  return 1 - freedomFromSVD(T, age, selfRepair);
}

/** Published calibration points (for display alongside the fitted curve). */
export const CALIBRATION_POINTS = [
  { year: 10, freedom: 88.3, age: 51, source: "Bourguignon 2015 (≤60 y)" },
  { year: 15, freedom: 70.8, age: 51, source: "Bourguignon 2015 (≤60 y)" },
  { year: 20, freedom: 38.1, age: 51, source: "Bourguignon 2015 (≤60 y)" },
];

export interface ValveBaseline {
  eoa0: number; // implanted EOA, cm^2
  roa0: number; // implanted regurgitant orifice, cm^2
}

/** Map damage d (0..~1.4) and mechanism mix to aortic valve geometry. */
export function valveFromDamage(base: ValveBaseline, d: number, mode: number) {
  const dd = Math.min(Math.max(d, 0), 1.4);
  const norm = Math.max(mode, 1 - mode);
  const ds = (dd * (1 - mode)) / norm;
  const dr = (dd * mode) / norm;
  const eoa = Math.max(0.3, base.eoa0 * (1 - 0.5 * ds));
  const roa = base.roa0 + 0.33 * dr;
  return { eoa, roa };
}

export function withValve(p: TwinParams, eoa: number, roa: number): TwinParams {
  return { ...p, aortic: { ...p.aortic, eoaMax: eoa, roa } };
}

export type Policy = "none" | "stage2" | "stage3";

export interface LifetimeInput {
  params: TwinParams;
  ageAtImplant: number;
  percentile: number;
  mode: number;
  selfRepair: number;
  policy: Policy;
  repairRestore: number; // fraction of damage reversed per repair
  horizon: number; // years
  step: number; // years between surveillance studies
}

export interface LifetimePoint {
  year: number;
  age: number;
  damage: number;
  eoaSet: number;
  roaSet: number;
  h: Haemodynamics;
  stage: 0 | 1 | 2 | 3;
  repaired: boolean;
}

export interface LifetimeResult {
  points: LifetimePoint[];
  Tp: number;
  firstStage2: number | null;
  firstStage3: number | null;
  repairs: number[];
}

export function runLifetime(inp: LifetimeInput): LifetimeResult {
  const Tp = individualT(inp.ageAtImplant, inp.percentile, inp.selfRepair);
  const base: ValveBaseline = { eoa0: inp.params.aortic.eoaMax, roa0: inp.params.aortic.roa };
  const points: LifetimePoint[] = [];
  const repairs: number[] = [];
  let warm: TwinState | undefined;
  let baseH: Haemodynamics | null = null;
  let firstStage2: number | null = null;
  let firstStage3: number | null = null;
  // damage clock: d = ((t - t0 + offset)/Tp)^k ; repairs rewind the clock
  let clockStart = 0;
  let clockOffset = 0;

  const nSteps = Math.round(inp.horizon / inp.step);
  for (let i = 0; i <= nSteps; i++) {
    const year = i * inp.step;
    let damage = Math.pow((year - clockStart + clockOffset) / Tp, WEIBULL_K);
    let { eoa, roa } = valveFromDamage(base, damage, inp.mode);
    let sim = simulate(withValve(inp.params, eoa, roa), warm, { tol: 0.5 });
    warm = sim.state;
    if (!baseH) baseH = sim.haemo;
    let stage = varc3Stage(sim.haemo, baseH, damage);
    let repaired = false;
    const trigger =
      (inp.policy === "stage2" && stage >= 2) || (inp.policy === "stage3" && stage >= 3);
    if (stage >= 2 && firstStage2 === null) firstStage2 = year;
    if (stage >= 3 && firstStage3 === null) firstStage3 = year;
    if (trigger && i > 0) {
      repaired = true;
      repairs.push(year);
      damage = damage * (1 - inp.repairRestore);
      clockStart = year;
      clockOffset = Tp * Math.pow(damage, 1 / WEIBULL_K);
      ({ eoa, roa } = valveFromDamage(base, damage, inp.mode));
      sim = simulate(withValve(inp.params, eoa, roa), warm, { tol: 0.5 });
      warm = sim.state;
      stage = varc3Stage(sim.haemo, baseH, damage);
    }
    points.push({
      year,
      age: inp.ageAtImplant + year,
      damage,
      eoaSet: eoa,
      roaSet: roa,
      h: sim.haemo,
      stage,
      repaired,
    });
  }
  return { points, Tp, firstStage2, firstStage3, repairs };
}

export const DEFAULT_LIFETIME: Omit<LifetimeInput, "params"> = {
  ageAtImplant: 55,
  percentile: 0.5,
  mode: 0.25,
  selfRepair: 0,
  policy: "none",
  repairRestore: 0.6,
  horizon: 25,
  step: 1,
};

export { DEFAULT_PARAMS };
