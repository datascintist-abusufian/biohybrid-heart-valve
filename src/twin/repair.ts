/**
 * Virtual valve repair: apply a procedure to the patient's twin, re-solve the
 * circulation, and judge the result against published success criteria.
 *
 * Procedures
 *  - Valve-in-valve TAVR inside the failed biohybrid aortic valve (balloon- or
 *    self-expanding THV, optional bioprosthetic valve fracture). Post-implant EOA
 *    is calibrated so a 21 mm true-ID surgical valve gives a mean gradient near the
 *    VIVID registry average (~16 mmHg); self-expanding supra-annular valves and
 *    fracture lower it by amounts consistent with the REDUCE registry regression.
 *  - Redo surgical AVR with a new stented bioprosthesis (approximate reference EOA
 *    by label size).
 *  - Mitral transcatheter edge-to-edge repair (TEER): each clip closes most of the
 *    regurgitant orifice in its segment (and part of the neighbouring ones) but
 *    removes orifice area, creating a double-orifice valve. Calibrated so one
 *    central clip roughly doubles a normal mean diastolic gradient (1.6 -> 3.1 mmHg
 *    reported after MitraClip); > 5 mmHg is flagged as it is linked to worse survival.
 *  - Biohybrid in-situ repair (hypothetical): cell/nanorobot-mediated
 *    decalcification and tear sealing of the existing leaflets.
 *
 * A model-based planner enumerates candidate plans, simulates each on the twin
 * and ranks them by the success criteria.
 */

import { Haemodynamics, SimResult, TwinParams, TwinState, simulate } from "./model";

export type Position = "aortic" | "mitral";
export type Segment = 0 | 1 | 2;
export const SEGMENTS = ["A1–P1 (medial)", "A2–P2 (central)", "A3–P3 (lateral)"];

export interface RepairCase {
  id: string;
  name: string;
  desc: string;
  position: Position;
  jet: [number, number, number]; // share of mitral regurgitant orifice per segment
  apply: (p: TwinParams) => TwinParams;
}

const aortic = (p: TwinParams, a: Partial<TwinParams["aortic"]>): TwinParams => ({ ...p, aortic: { ...p.aortic, ...a } });
const mitral = (p: TwinParams, m: Partial<TwinParams["mitral"]>): TwinParams => ({ ...p, mitral: { ...p.mitral, ...m } });

export const CASES: RepairCase[] = [
  {
    id: "svd-as",
    name: "Failed biohybrid valve: stenosis",
    desc: "Calcified leaflets, EOA 0.7 cm²",
    position: "aortic",
    jet: [0.33, 0.34, 0.33],
    apply: (p) => aortic(p, { eoaMax: 0.7, roa: 0.02 }),
  },
  {
    id: "svd-ar",
    name: "Failed biohybrid valve: leaflet tear",
    desc: "Intraprosthetic regurgitation, orifice 0.3 cm²",
    position: "aortic",
    jet: [0.33, 0.34, 0.33],
    apply: (p) => aortic(p, { roa: 0.3 }),
  },
  {
    id: "svd-mixed",
    name: "Failed biohybrid valve: mixed",
    desc: "EOA 0.9 cm² plus regurgitant orifice 0.15 cm²",
    position: "aortic",
    jet: [0.33, 0.34, 0.33],
    apply: (p) => aortic(p, { eoaMax: 0.9, roa: 0.15 }),
  },
  {
    id: "dmr-p2",
    name: "Degenerative MR: P2 flail",
    desc: "Central jet, regurgitant orifice 0.45 cm²",
    position: "mitral",
    jet: [0.1, 0.8, 0.1],
    apply: (p) => mitral(p, { roa: 0.45 }),
  },
  {
    id: "dmr-p3",
    name: "Degenerative MR: P3 prolapse",
    desc: "Lateral jet, regurgitant orifice 0.35 cm²",
    position: "mitral",
    jet: [0.05, 0.25, 0.7],
    apply: (p) => mitral(p, { roa: 0.35 }),
  },
  {
    id: "fmr",
    name: "Functional MR: dilated LV",
    desc: "Broad jet, orifice 0.3 cm², Ees 1.2 mmHg/mL",
    position: "mitral",
    jet: [0.3, 0.4, 0.3],
    apply: (p) => mitral({ ...p, emaxLV: 1.2, stressedVolume: Math.max(p.stressedVolume, 780) }, { roa: 0.3 }),
  },
  {
    id: "current",
    name: "Current twin as it is",
    desc: "Use the valve state set on the Live tab",
    position: "aortic",
    jet: [0.2, 0.6, 0.2],
    apply: (p) => p,
  },
];

// ---------------------------------------------------------------- plans
export type Plan =
  | { kind: "viv"; thv: "BEV" | "SEV"; bvf: boolean; trueID: number }
  | { kind: "savr"; label: number }
  | { kind: "biohybrid"; decalc: number; seal: number; eoaOriginal: number }
  | { kind: "teer"; clips: Segment[]; width: "NTR" | "XTR" };

export function planLabel(pl: Plan): string {
  switch (pl.kind) {
    case "viv":
      return `ViV TAVR, ${pl.thv === "BEV" ? "balloon-expandable" : "self-expanding supra-annular"}${pl.bvf ? " + valve fracture" : ""}`;
    case "savr":
      return `Redo surgical AVR, ${pl.label} mm bioprosthesis`;
    case "biohybrid":
      return `Biohybrid in-situ repair (decalcify ${Math.round(pl.decalc * 100)}%, seal ${Math.round(pl.seal * 100)}%)`;
    case "teer": {
      const n = pl.clips.length;
      return `TEER: ${n} ${pl.width} clip${n > 1 ? "s" : ""} at ${pl.clips.map((c) => ["A1P1", "A2P2", "A3P3"][c]).join(" + ")}`;
    }
  }
}

export interface Applied {
  params: TwinParams;
  notes: string[];
}

/** Apply a plan to the pre-procedure twin. */
export function applyPlan(pre: TwinParams, pl: Plan, jet: [number, number, number]): Applied {
  const notes: string[] = [];
  switch (pl.kind) {
    case "viv": {
      let eoa = (pl.thv === "BEV" ? 1.49 : 1.99) + 0.05 * (pl.trueID - 21);
      if (pl.bvf) eoa += pl.thv === "BEV" ? 0.3 : 0.2;
      if (pl.trueID <= 19 && !pl.bvf) notes.push("Small surgical valve (true ID ≤ 19 mm): high residual gradient likely without fracture.");
      if (pl.bvf) notes.push("Valve fracture needs a fracturable surgical frame and a high-pressure balloon.");
      return { params: aortic(pre, { eoaMax: Math.max(0.5, eoa), roa: 0.008 }), notes };
    }
    case "savr": {
      const eoa = 0.11 * pl.label - 1.0;
      notes.push("Redo sternotomy carries higher operative risk than ViV TAVR (not modelled).");
      return { params: aortic(pre, { eoaMax: eoa, roa: 0 }), notes };
    }
    case "biohybrid": {
      const eoa = pre.aortic.eoaMax + pl.decalc * Math.max(0, pl.eoaOriginal - pre.aortic.eoaMax);
      const roa = pre.aortic.roa * (1 - pl.seal);
      notes.push("Hypothetical procedure: efficacy values are assumptions, not measured device data.");
      return { params: aortic(pre, { eoaMax: eoa, roa }), notes };
    }
    case "teer": {
      const eff = pl.width === "NTR" ? 0.8 : 0.9; // closure of the clipped segment
      const adj = 0.3; // spill-over onto neighbouring segments
      const seg = jet.map((w) => w * pre.mitral.roa);
      for (const c of pl.clips) {
        seg[c] *= 1 - eff;
        if (c > 0) seg[c - 1] *= 1 - adj * eff;
        if (c < 2) seg[c + 1] *= 1 - adj * eff;
      }
      const roa = seg.reduce((a, b) => a + b, 0);
      const loss = (pl.width === "NTR" ? 1.0 : 1.2) * pl.clips.length;
      const mva = Math.max(0.6, (pre.mitral.eoaMax - loss) * 0.9);
      if (pl.clips.length > 1) notes.push("Multiple clips raise the risk of iatrogenic mitral stenosis.");
      notes.push("LVEF usually falls after MR correction because the low-pressure leak into the atrium is removed; forward flow is what improves.");
      return { params: mitral(pre, { roa, eoaMax: mva }), notes };
    }
  }
}

// ---------------------------------------------------------------- criteria
export interface Criterion {
  label: string;
  value: string;
  pass: boolean;
}

/** Peak left-atrial pressure (the v-wave in mitral regurgitation). */
export function vWave(sim: SimResult) {
  let m = -Infinity;
  for (let i = 0; i < sim.trace.pLA.length; i++) m = Math.max(m, sim.trace.pLA[i]);
  return m;
}

export function criteria(position: Position, h: Haemodynamics, pre: Haemodynamics, vPost = 0, vPre = 0): Criterion[] {
  if (position === "aortic") {
    return [
      { label: "Mean gradient < 20 mmHg", value: `${h.avMeanGradient.toFixed(1)} mmHg`, pass: h.avMeanGradient < 20 },
      { label: "Peak velocity < 3 m/s", value: `${h.avVmax.toFixed(2)} m/s`, pass: h.avVmax < 3 },
      { label: "DVI ≥ 0.25", value: h.dvi.toFixed(2), pass: h.dvi >= 0.25 },
      { label: "Less than moderate aortic regurgitation", value: `RF ${h.arRF.toFixed(0)}%`, pass: h.arRF < 30 },
    ];
  }
  void vPost;
  void vPre;
  const fwd = ((h.forwardSV - pre.forwardSV) / pre.forwardSV) * 100;
  return [
    { label: "Residual MR ≤ moderate", value: `RF ${h.mrRF.toFixed(0)}%`, pass: h.mrRF < 50 },
    { label: "Residual MR ≤ mild (optimal)", value: `RF ${h.mrRF.toFixed(0)}%`, pass: h.mrRF < 30 },
    { label: "Mean mitral gradient ≤ 5 mmHg", value: `${h.mvMeanGradient.toFixed(1)} mmHg`, pass: h.mvMeanGradient <= 5 },
    { label: "Forward stroke volume rises ≥ 10%", value: `${fwd >= 0 ? "+" : "−"}${Math.abs(fwd).toFixed(0)}%`, pass: fwd >= 10 },
  ];
}

// ---------------------------------------------------------------- planner
export interface Outcome {
  plan: Plan;
  label: string;
  sim: SimResult;
  crit: Criterion[];
  score: number;
  notes: string[];
}

function score(position: Position, h: Haemodynamics, crit: Criterion[], pl: Plan) {
  const fails = crit.filter((c) => !c.pass).length;
  if (position === "aortic") {
    const invasive = pl.kind === "savr" ? 6 : 0; // prefer less invasive when similar
    return fails * 100 + h.avMeanGradient + h.arRF * 0.5 + invasive;
  }
  const clipPenalty = pl.kind === "teer" ? pl.clips.length * 1.5 : 0;
  return fails * 100 + h.mrRF + 4 * Math.max(0, h.mvMeanGradient - 3) + clipPenalty;
}

export function evaluate(pre: TwinParams, preSim: SimResult, pl: Plan, c: RepairCase, position: Position, warm?: TwinState): Outcome {
  const a = applyPlan(pre, pl, c.jet);
  const sim = simulate(a.params, warm, { tol: 0.3 });
  const crit = criteria(position, sim.haemo, preSim.haemo, vWave(sim), vWave(preSim));
  return { plan: pl, label: planLabel(pl), sim, crit, score: score(position, sim.haemo, crit, pl), notes: a.notes };
}

export function candidatePlans(position: Position, opts: { trueID: number; includeHypothetical: boolean; eoaOriginal: number }): Plan[] {
  const out: Plan[] = [];
  if (position === "aortic") {
    for (const thv of ["BEV", "SEV"] as const)
      for (const bvf of [false, true]) out.push({ kind: "viv", thv, bvf, trueID: opts.trueID });
    for (const label of [21, 23, 25]) out.push({ kind: "savr", label });
    if (opts.includeHypothetical) out.push({ kind: "biohybrid", decalc: 0.7, seal: 0.8, eoaOriginal: opts.eoaOriginal });
  } else {
    const segs: Segment[] = [0, 1, 2];
    for (const width of ["NTR", "XTR"] as const) {
      for (const a of segs) out.push({ kind: "teer", clips: [a], width });
      for (const a of segs) for (const b of segs) if (b >= a) out.push({ kind: "teer", clips: [a, b], width });
      for (const a of segs) for (const b of segs) for (const d of segs) if (b >= a && d >= b) out.push({ kind: "teer", clips: [a, b, d], width });
    }
  }
  return out;
}

/** Simulate every candidate plan on the twin and rank them. */
export async function planSearch(
  pre: TwinParams,
  preSim: SimResult,
  c: RepairCase,
  position: Position,
  opts: { trueID: number; includeHypothetical: boolean; eoaOriginal: number },
  onProgress?: (done: number, total: number) => void
): Promise<Outcome[]> {
  const plans = candidatePlans(position, opts);
  const res: Outcome[] = [];
  let warm = preSim.state;
  for (let i = 0; i < plans.length; i++) {
    const o = evaluate(pre, preSim, plans[i], c, position, warm);
    warm = o.sim.state;
    res.push(o);
    if (i % 4 === 3) {
      onProgress?.(i + 1, plans.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(plans.length, plans.length);
  return res.sort((a, b) => a.score - b.score);
}
