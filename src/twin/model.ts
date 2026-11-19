/**
 * Biohybrid aortic valve digital twin: closed-loop lumped-parameter model of the
 * left heart and systemic circulation with dynamic (non-ideal) valves.
 *
 * Components
 *  - LV and LA: time-varying elastance with double-Hill activation
 *    (Stergiopulos et al. 1996; parameters as used by Mynard et al. 2012).
 *    LV passive filling follows an exponential EDPVR.
 *  - Systemic arteries: 3-element Windkessel (Zc, C_sa, R_sys).
 *  - Venous + pulmonary reservoir: single compliance returning to the LA.
 *  - Valves: Mynard et al. 2012 model, dp = B q|q| + L dq/dt, B = rho/(2A^2),
 *    L = rho*l/A, A = (Amax - Amin)*zeta + Amin, zeta driven by dp.
 *
 * Units: pressure mmHg, volume mL, flow mL/s, area cm^2, time s.
 */

export const RHO = 1.06; // g/cm^3
const DYN_PER_MMHG = 1333.22;

export interface ValveSpec {
  eoaMax: number; // fully-open effective orifice area, cm^2
  roa: number; // regurgitant (closed) orifice area, cm^2
  leff: number; // effective length, cm
  kvo: number; // opening rate, 1/(mmHg s)
  kvc: number; // closing rate, 1/(mmHg s)
}

export interface TwinParams {
  hr: number; // beats/min
  emaxLV: number; // end-systolic elastance, mmHg/mL
  v0LV: number; // mL
  edpA: number; // EDPVR scale, mmHg
  edpB: number; // EDPVR stiffness, 1/mL
  emaxLA: number;
  eminLA: number;
  v0LA: number;
  rSys: number; // mmHg s/mL
  cSa: number; // mL/mmHg
  zc: number; // mmHg s/mL
  cSv: number; // mL/mmHg
  rVen: number; // mmHg s/mL
  stressedVolume: number; // mL
  lvotDiameter: number; // cm (for DVI and velocity)
  aortic: ValveSpec;
  mitral: ValveSpec;
}

export const DEFAULT_PARAMS: TwinParams = {
  hr: 70,
  emaxLV: 2.5,
  v0LV: 10,
  edpA: 0.55,
  edpB: 0.026,
  emaxLA: 0.3,
  eminLA: 0.15,
  v0LA: 4,
  rSys: 0.85,
  cSa: 1.35,
  zc: 0.04,
  cSv: 40,
  rVen: 0.012,
  stressedVolume: 690,
  lvotDiameter: 2.1,
  aortic: { eoaMax: 1.8, roa: 0, leff: 1.0, kvo: 30, kvc: 40 },
  mitral: { eoaMax: 4.0, roa: 0, leff: 1.5, kvo: 30, kvc: 40 },
};

export interface TwinState {
  vLV: number;
  vLA: number;
  vSa: number;
  vSv: number;
  qAV: number;
  qMV: number;
  zAV: number;
  zMV: number;
}

export interface BeatTrace {
  t: Float64Array; // s from start of beat
  pLV: Float64Array;
  pAo: Float64Array; // aortic root
  pLA: Float64Array;
  vLV: Float64Array;
  qAV: Float64Array;
  qMV: Float64Array;
  zAV: Float64Array;
  zMV: Float64Array;
}

export interface Haemodynamics {
  sbp: number;
  dbp: number;
  map: number;
  edv: number;
  esv: number;
  sv: number; // total LV stroke volume (EDV-ESV)
  forwardSV: number; // net aortic forward volume per beat
  ef: number; // %
  co: number; // L/min, net forward
  edp: number;
  lapMean: number;
  strokeWork: number; // mmHg*mL per beat (PV loop area)
  avMeanGradient: number; // Doppler-equivalent 4v^2, mmHg
  avPeakGradient: number;
  avCatheterMeanGradient: number; // mean (P_LV - P_Ao) during ejection
  avVmax: number; // m/s
  avGorlinEOA: number; // cm^2
  dvi: number;
  arRF: number; // aortic regurgitant fraction, %
  arVolume: number; // mL/beat
  mvMeanGradient: number;
  mrRF: number;
  mrVolume: number;
  ejectionTime: number; // ms
}

// ---------- activation functions ----------
function doubleHill(t: number, T: number, tau1: number, tau2: number, m1: number, m2: number) {
  const g1 = Math.pow(t / (tau1 * T), m1);
  const g2 = Math.pow(t / (tau2 * T), m2);
  return (g1 / (1 + g1)) * (1 / (1 + g2));
}

interface Activation {
  lv: (t: number) => number;
  la: (t: number) => number;
}

const actCache = new Map<number, Activation>();

function activation(T: number): Activation {
  const key = Math.round(T * 1e5);
  const hit = actCache.get(key);
  if (hit) return hit;
  // Normalise each curve to a peak of 1
  let mLV = 0;
  let mLA = 0;
  for (let i = 1; i <= 2000; i++) {
    const t = (i / 2000) * T;
    mLV = Math.max(mLV, doubleHill(t, T, 0.269, 0.452, 1.32, 27.4));
    mLA = Math.max(mLA, doubleHill(t, T, 0.11, 0.18, 1.32, 13.1));
  }
  const laOnset = 0.85 * T; // atrial kick ~150 ms before ventricular onset at 70 bpm
  const a: Activation = {
    lv: (t) => doubleHill(t, T, 0.269, 0.452, 1.32, 27.4) / mLV,
    la: (t) => {
      let tl = t - laOnset;
      if (tl < 0) tl += T;
      return doubleHill(tl, T, 0.11, 0.18, 1.32, 13.1) / mLA;
    },
  };
  actCache.set(key, a);
  return a;
}

// ---------- valve helpers ----------
const AMIN_FLOOR = 5e-4; // cm^2, numerical floor for a competent valve

export function valveArea(v: ValveSpec, z: number) {
  const amin = Math.max(v.roa, AMIN_FLOOR);
  const amax = Math.max(v.eoaMax, amin + 1e-3);
  return (amax - amin) * z + amin;
}

function bCoef(A: number) {
  return RHO / (2 * A * A) / DYN_PER_MMHG; // mmHg s^2/mL^2
}

function lCoef(A: number, leff: number) {
  return (RHO * leff) / A / DYN_PER_MMHG; // mmHg s^2/mL
}

function pLVof(p: TwinParams, e: number, v: number) {
  const active = p.emaxLV * (v - p.v0LV);
  const passive = p.edpA * (Math.exp(p.edpB * (v - p.v0LV)) - 1);
  return e * active + (1 - e) * passive;
}

function pLAof(p: TwinParams, e: number, v: number) {
  return (p.eminLA + (p.emaxLA - p.eminLA) * e) * (v - p.v0LA);
}

export function initialState(p: TwinParams): TwinState {
  // A plausible starting distribution of stressed volume
  const vLV = 110;
  const vLA = 55;
  const vSa = 90 * p.cSa;
  const vSv = Math.max(10, p.stressedVolume - vLV - vLA - vSa);
  return { vLV, vLA, vSa, vSv, qAV: 0, qMV: 0, zAV: 0, zMV: 0.5 };
}

function stateVolume(s: TwinState) {
  return s.vLV + s.vLA + s.vSa + s.vSv;
}

/** Rescale venous volume so the total stressed volume matches the parameter. */
function conserve(p: TwinParams, s: TwinState) {
  const diff = p.stressedVolume - stateVolume(s);
  s.vSv = Math.max(5, s.vSv + diff);
}

export interface SimOptions {
  dt?: number; // s
  maxBeats?: number;
  minBeats?: number;
  tol?: number; // mL change in EDV between beats for convergence
  recordEvery?: number; // steps between samples on the recorded beat
}

export interface SimResult {
  trace: BeatTrace;
  haemo: Haemodynamics;
  state: TwinState; // state at the end of the recorded beat (warm start)
  beats: number;
}

/**
 * Run the model to a periodic steady state and return the last beat.
 */
export function simulate(p: TwinParams, start?: TwinState, opts: SimOptions = {}): SimResult {
  const dt = opts.dt ?? 2e-4;
  const maxBeats = opts.maxBeats ?? 30;
  const minBeats = opts.minBeats ?? 4;
  const tol = opts.tol ?? 0.3;
  const recordEvery = opts.recordEvery ?? 5;

  const T = 60 / p.hr;
  const act = activation(T);
  const nSteps = Math.round(T / dt);
  const s: TwinState = start ? { ...start } : initialState(p);
  conserve(p, s);

  const nRec = Math.floor(nSteps / recordEvery) + 1;
  let rec: BeatTrace | null = null;
  let prevEDV = -1;
  let beats = 0;

  for (let beat = 0; beat < maxBeats; beat++) {
    beats++;
    // decide whether to record: record when converged or at last beat
    const recording = rec !== null;
    const tr: BeatTrace | null = recording
      ? rec
      : null;
    let edv = 0;
    let k = 0;
    for (let i = 0; i < nSteps; i++) {
      const t = i * dt;
      const eLV = act.lv(t);
      const eLA = act.la(t);
      const pLV = pLVof(p, eLV, s.vLV);
      const pLA = pLAof(p, eLA, s.vLA);
      const pSa = s.vSa / p.cSa;
      const pSv = s.vSv / p.cSv;
      const pAo = pSa + p.zc * s.qAV;

      if (tr && i % recordEvery === 0 && k < nRec) {
        tr.t[k] = t;
        tr.pLV[k] = pLV;
        tr.pAo[k] = pAo;
        tr.pLA[k] = pLA;
        tr.vLV[k] = s.vLV;
        tr.qAV[k] = s.qAV;
        tr.qMV[k] = s.qMV;
        tr.zAV[k] = s.zAV;
        tr.zMV[k] = s.zMV;
        k++;
      }
      if (s.vLV > edv) edv = s.vLV;

      // valve dynamics (Mynard 2012)
      const dpAV = pLV - pAo;
      const dpMV = pLA - pLV;
      const aAV = valveArea(p.aortic, s.zAV);
      const aMV = valveArea(p.mitral, s.zMV);
      const bAV = bCoef(aAV);
      const lAV = lCoef(aAV, p.aortic.leff);
      const bMV = bCoef(aMV);
      const lMV = lCoef(aMV, p.mitral.leff);
      const qAV = (s.qAV + (dt * dpAV) / lAV) / (1 + (dt * bAV * Math.abs(s.qAV)) / lAV);
      const qMV = (s.qMV + (dt * dpMV) / lMV) / (1 + (dt * bMV * Math.abs(s.qMV)) / lMV);

      const dzAV = dpAV > 0 ? (1 - s.zAV) * p.aortic.kvo * dpAV : s.zAV * p.aortic.kvc * dpAV;
      const dzMV = dpMV > 0 ? (1 - s.zMV) * p.mitral.kvo * dpMV : s.zMV * p.mitral.kvc * dpMV;

      const qSys = (pSa - pSv) / p.rSys;
      const qVen = (pSv - pLA) / p.rVen;

      s.vLV += dt * (qMV - qAV);
      s.vLA += dt * (qVen - qMV);
      s.vSa += dt * (qAV - qSys);
      s.vSv += dt * (qSys - qVen);
      s.qAV = qAV;
      s.qMV = qMV;
      s.zAV = Math.min(1, Math.max(0, s.zAV + dt * dzAV));
      s.zMV = Math.min(1, Math.max(0, s.zMV + dt * dzMV));
    }
    if (tr) {
      const haemo = analyse(p, tr, k);
      return { trace: sliceTrace(tr, k), haemo, state: { ...s }, beats };
    }
    const converged = beat + 1 >= minBeats && prevEDV > 0 && Math.abs(edv - prevEDV) < tol;
    prevEDV = edv;
    if (converged || beat === maxBeats - 2) {
      rec = {
        t: new Float64Array(nRec),
        pLV: new Float64Array(nRec),
        pAo: new Float64Array(nRec),
        pLA: new Float64Array(nRec),
        vLV: new Float64Array(nRec),
        qAV: new Float64Array(nRec),
        qMV: new Float64Array(nRec),
        zAV: new Float64Array(nRec),
        zMV: new Float64Array(nRec),
      };
    }
  }
  throw new Error("simulation did not record a beat");
}

function sliceTrace(tr: BeatTrace, n: number): BeatTrace {
  return {
    t: tr.t.slice(0, n),
    pLV: tr.pLV.slice(0, n),
    pAo: tr.pAo.slice(0, n),
    pLA: tr.pLA.slice(0, n),
    vLV: tr.vLV.slice(0, n),
    qAV: tr.qAV.slice(0, n),
    qMV: tr.qMV.slice(0, n),
    zAV: tr.zAV.slice(0, n),
    zMV: tr.zMV.slice(0, n),
  };
}

/** Clinical haemodynamic indices from one steady-state beat. */
export function analyse(p: TwinParams, tr: BeatTrace, n: number): Haemodynamics {
  const dts = tr.t[1] - tr.t[0];
  let sbp = -Infinity;
  let dbp = Infinity;
  let mapSum = 0;
  let edv = -Infinity;
  let esv = Infinity;
  let lapSum = 0;
  let avFwd = 0;
  let avBack = 0;
  let mvFwd = 0;
  let mvBack = 0;
  let ejN = 0;
  let ejFlowSum = 0;
  let ejGradSum = 0; // 4v^2 Doppler-equivalent
  let ejCathSum = 0;
  let vmax = 0;
  let vtiJet = 0;
  let vtiLvot = 0;
  let mvGradSum = 0;
  let mvN = 0;
  let sw = 0;
  const edp = tr.pLV[0]; // onset of ventricular activation = end-diastole
  const lvotArea = Math.PI * (p.lvotDiameter / 2) ** 2;

  for (let i = 0; i < n; i++) {
    const pAo = tr.pAo[i];
    sbp = Math.max(sbp, pAo);
    dbp = Math.min(dbp, pAo);
    mapSum += pAo;
    lapSum += tr.pLA[i];
    if (tr.vLV[i] > edv) edv = tr.vLV[i];
    esv = Math.min(esv, tr.vLV[i]);
    const qa = tr.qAV[i];
    const qm = tr.qMV[i];
    if (qa > 0) avFwd += qa * dts;
    else avBack -= qa * dts;
    if (qm > 0) mvFwd += qm * dts;
    else mvBack -= qm * dts;

    const aAV = valveArea(p.aortic, tr.zAV[i]);
    if (qa > 1 && tr.zAV[i] > 0.05) {
      const v = qa / aAV / 100; // m/s
      ejN++;
      ejFlowSum += qa;
      ejGradSum += 4 * v * v;
      ejCathSum += tr.pLV[i] - tr.pAo[i];
      vmax = Math.max(vmax, v);
      vtiJet += v * dts;
      vtiLvot += (qa / lvotArea / 100) * dts;
    }
    if (qm > 1 && tr.zMV[i] > 0.05) {
      mvGradSum += tr.pLA[i] - tr.pLV[i];
      mvN++;
    }
    const j = (i + 1) % n;
    // PV loop area via shoelace (counter-clockwise positive)
    sw += tr.vLV[i] * tr.pLV[j] - tr.vLV[j] * tr.pLV[i];
  }
  const map = mapSum / n;
  const meanGrad = ejN ? ejGradSum / ejN : 0;
  const meanFlow = ejN ? ejFlowSum / ejN : 0;
  const gorlin = meanGrad > 0.1 ? meanFlow / (44.3 * Math.sqrt(meanGrad)) : NaN;
  const forwardSV = avFwd - avBack;
  return {
    sbp,
    dbp,
    map,
    edv,
    esv,
    sv: edv - esv,
    forwardSV,
    ef: ((edv - esv) / edv) * 100,
    co: (forwardSV * p.hr) / 1000,
    edp,
    lapMean: lapSum / n,
    strokeWork: Math.abs(sw) / 2,
    avMeanGradient: meanGrad,
    avPeakGradient: 4 * vmax * vmax,
    avCatheterMeanGradient: ejN ? ejCathSum / ejN : 0,
    avVmax: vmax,
    avGorlinEOA: gorlin,
    dvi: vtiJet > 0 ? vtiLvot / vtiJet : NaN,
    arRF: avFwd > 0 ? (avBack / avFwd) * 100 : 0,
    arVolume: avBack,
    mvMeanGradient: mvN ? mvGradSum / mvN : 0,
    mrRF: mvFwd > 0 ? (mvBack / mvFwd) * 100 : 0,
    mrVolume: mvBack,
    ejectionTime: ejN * dts * 1000,
  };
}

// ---------- clinical classification ----------
export type Grade = "normal" | "borderline" | "abnormal";

/** ASE 2009 (Zoghbi et al.) criteria for prosthetic aortic valve stenosis. */
export function aseProstheticAS(h: Haemodynamics): { grade: Grade; label: string } {
  const g = h.avMeanGradient;
  const v = h.avVmax;
  const dvi = h.dvi;
  if (v > 4 || g > 35 || dvi < 0.25) return { grade: "abnormal", label: "Suggests significant stenosis" };
  if (v >= 3 || g >= 20 || dvi < 0.3) return { grade: "borderline", label: "Possible stenosis" };
  return { grade: "normal", label: "Normal prosthetic function" };
}

export function regurgSeverity(rf: number): { grade: Grade; label: string } {
  if (rf >= 50) return { grade: "abnormal", label: "Severe" };
  if (rf >= 30) return { grade: "borderline", label: "Moderate" };
  if (rf >= 5) return { grade: "normal", label: "Mild / trace" };
  return { grade: "normal", label: "None" };
}

/** Patient-prosthesis mismatch from indexed EOA (cm^2/m^2). */
export function ppm(eoa: number, bsa: number): { grade: Grade; label: string; ieoa: number } {
  const ieoa = eoa / bsa;
  if (ieoa <= 0.65) return { grade: "abnormal", label: "Severe PPM", ieoa };
  if (ieoa <= 0.85) return { grade: "borderline", label: "Moderate PPM", ieoa };
  return { grade: "normal", label: "No significant PPM", ieoa };
}

export function bsaMosteller(heightCm: number, weightKg: number) {
  return Math.sqrt((heightCm * weightKg) / 3600);
}

/**
 * VARC-3 haemodynamic valve deterioration stage relative to a baseline study.
 * Stage 2: mean gradient rise >=10 to >=20 mmHg with EOA fall >=0.3 cm^2 or >=25%
 *          and/or DVI fall >=0.1 or >=20%, or moderate intraprosthetic AR.
 * Stage 3: mean gradient rise >=20 to >=30 mmHg with EOA fall >=0.6 cm^2 or >=50%
 *          and/or DVI fall >=0.2 or >=40%, or severe AR.
 */
export function varc3Stage(
  h: Haemodynamics,
  base: Haemodynamics,
  morphologicalDamage: number
): 0 | 1 | 2 | 3 {
  const dG = h.avMeanGradient - base.avMeanGradient;
  const eoaDrop = base.avGorlinEOA - h.avGorlinEOA;
  const eoaRel = eoaDrop / base.avGorlinEOA;
  const dviDrop = base.dvi - h.dvi;
  const dviRel = dviDrop / base.dvi;
  const s3 =
    (h.avMeanGradient >= 30 && dG >= 20 && (eoaDrop >= 0.6 || eoaRel >= 0.5 || dviDrop >= 0.2 || dviRel >= 0.4)) ||
    h.arRF >= 50;
  if (s3) return 3;
  const s2 =
    (h.avMeanGradient >= 20 && dG >= 10 && (eoaDrop >= 0.3 || eoaRel >= 0.25 || dviDrop >= 0.1 || dviRel >= 0.2)) ||
    h.arRF >= 30;
  if (s2) return 2;
  if (morphologicalDamage >= 0.1) return 1;
  return 0;
}
