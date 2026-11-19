import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_PARAMS,
  Grade,
  Haemodynamics,
  TwinParams,
  TwinState,
  aseProstheticAS,
  bsaMosteller,
  ppm,
  regurgSeverity,
  simulate,
  valveArea,
} from "./twin/model";
import {
  CALIBRATION_POINTS,
  DEFAULT_LIFETIME,
  LifetimeResult,
  Policy,
  freedomFromSVD,
  percentileOfT,
  runLifetime,
} from "./twin/lifetime";
import { FIT_PARAMS, FitResult, FollowUp, Measurements, PrognosisResult, calibrate, fitPrognosis } from "./twin/fit";
import { Plot, ValveFace } from "./twin/charts";

// ---------------------------------------------------------------- helpers
const f = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "–");

function downloadCSV(name: string, header: string[], rows: (string | number)[][]) {
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const gradeClass: Record<Grade, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  borderline: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  abnormal: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const Badge: React.FC<{ grade: Grade; children: React.ReactNode }> = ({ grade, children }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${gradeClass[grade]}`}>{children}</span>
);

const Card: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  right,
  children,
  className = "",
}) => (
  <section className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm ${className}`}>
    {(title || right) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        {right}
      </div>
    )}
    {children}
  </section>
);

const Kpi: React.FC<{ label: string; value: string; unit?: string; sub?: React.ReactNode }> = ({ label, value, unit, sub }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5 min-w-0">
    <div className="text-[11px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
    <div className="text-xl font-semibold tabular-nums">
      {value}
      {unit && <span className="text-xs font-normal text-slate-500 ml-1">{unit}</span>}
    </div>
    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  hint?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, unit, digits = 2, hint, onChange }) => (
  <label className="block" title={hint}>
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
        {value.toFixed(digits)} {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-rose-600"
    />
    {hint && <div className="text-[11px] text-slate-500 -mt-1">{hint}</div>}
  </label>
);

const NumField: React.FC<{
  label: string;
  value: number | undefined;
  unit?: string;
  step?: number;
  optional?: boolean;
  onChange: (v: number | undefined) => void;
}> = ({ label, value, unit, step = 1, optional, onChange }) => (
  <label className="block text-sm">
    <span className="text-slate-600 dark:text-slate-300">
      {label}
      {optional && <span className="text-slate-400"> (optional)</span>}
    </span>
    <div className="flex items-center gap-2 mt-1">
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 tabular-nums"
      />
      {unit && <span className="text-xs text-slate-500 w-14">{unit}</span>}
    </div>
  </label>
);

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }> = ({
  variant = "primary",
  className = "",
  ...rest
}) => (
  <button
    {...rest}
    className={`rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50 ${
      variant === "primary"
        ? "bg-rose-600 text-white hover:bg-rose-700"
        : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
    } ${className}`}
  />
);

// ---------------------------------------------------------------- presets
const withAortic = (p: TwinParams, a: Partial<TwinParams["aortic"]>): TwinParams => ({ ...p, aortic: { ...p.aortic, ...a } });

const PRESETS: { name: string; desc: string; make: () => TwinParams }[] = [
  { name: "Well-functioning valve", desc: "23 mm-class biohybrid valve, EOA 1.8 cm², normal LV", make: () => DEFAULT_PARAMS },
  { name: "Patient–prosthesis mismatch", desc: "Small valve (EOA 1.1 cm²) in a large patient", make: () => withAortic(DEFAULT_PARAMS, { eoaMax: 1.1 }) },
  { name: "Calcific SVD", desc: "Leaflet stiffening, EOA 0.75 cm²", make: () => withAortic(DEFAULT_PARAMS, { eoaMax: 0.75, roa: 0.03 }) },
  { name: "Leaflet tear (AR)", desc: "Regurgitant orifice 0.3 cm²", make: () => withAortic(DEFAULT_PARAMS, { roa: 0.3 }) },
  { name: "Reduced LV function", desc: "Ees 1.1 mmHg/mL, larger volume", make: () => ({ ...DEFAULT_PARAMS, emaxLV: 1.1, stressedVolume: 760 }) },
  { name: "Low-flow, low-gradient", desc: "Severe SVD with weak LV: gradient under-reads", make: () => withAortic({ ...DEFAULT_PARAMS, emaxLV: 0.9, stressedVolume: 760 }, { eoaMax: 0.75 }) },
];

// ---------------------------------------------------------------- live tab
function useBeatAnimation(n: number, beatMs: number, playing: boolean, speed: number) {
  const [idx, setIdx] = useState(0);
  const origin = useRef(performance.now());
  useEffect(() => {
    if (!playing || n < 2) return;
    let raf = 0;
    const loop = (now: number) => {
      const phase = (((now - origin.current) * speed) % beatMs) / beatMs;
      setIdx(Math.min(n - 1, Math.floor(phase * n)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [n, beatMs, playing, speed]);
  return idx;
}

const LiveTab: React.FC<{ params: TwinParams; setParams: (p: TwinParams) => void; bsa: number }> = ({ params, setParams, bsa }) => {
  const deferred = useDeferredValue(params);
  const warm = useRef<TwinState | undefined>();
  const sim = useMemo(() => {
    const r = simulate(deferred, warm.current);
    warm.current = r.state;
    return r;
  }, [deferred]);
  const h = sim.haemo;
  const tr = sim.trace;
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const beatMs = (60 / deferred.hr) * 1000;
  const idx = useBeatAnimation(tr.t.length, beatMs, playing, speed);
  const tMs = useMemo(() => Array.from(tr.t, (t) => t * 1000), [tr]);

  const aAV = valveArea(deferred.aortic, tr.zAV[idx] ?? 0);
  const aMV = valveArea(deferred.mitral, tr.zMV[idx] ?? 0);
  const lvotArea = Math.PI * (deferred.lvotDiameter / 2) ** 2;
  const as = aseProstheticAS(h);
  const ar = regurgSeverity(h.arRF);
  const mr = regurgSeverity(h.mrRF);
  const mm = ppm(deferred.aortic.eoaMax, bsa);
  const set = (patch: Partial<TwinParams>) => setParams({ ...params, ...patch });

  const pressureSeries = useMemo(
    () => [
      { x: tMs, y: tr.pLV, color: "#e11d48", label: "LV pressure" },
      { x: tMs, y: tr.pAo, color: "#2563eb", label: "Aortic root pressure" },
      { x: tMs, y: tr.pLA, color: "#16a34a", label: "LA pressure" },
    ],
    [tr, tMs]
  );
  const flowSeries = useMemo(
    () => [
      { x: tMs, y: tr.qAV, color: "#2563eb", label: "Aortic valve flow" },
      { x: tMs, y: tr.qMV, color: "#16a34a", label: "Mitral valve flow" },
    ],
    [tr, tMs]
  );
  const pvSeries = useMemo(() => [{ x: tr.vLV, y: tr.pLV, color: "#e11d48", label: "LV pressure–volume loop" }], [tr]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <aside className="xl:col-span-3 space-y-6">
        <Card title="Scenarios">
          <div className="grid gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setParams(p.make())}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 hover:border-rose-400"
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{p.desc}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Model parameters">
          <div className="space-y-3">
            <Slider label="Heart rate" value={params.hr} min={40} max={140} step={1} unit="bpm" digits={0} onChange={(v) => set({ hr: v })} />
            <Slider label="LV contractility (Ees)" value={params.emaxLV} min={0.5} max={5} step={0.05} unit="mmHg/mL" onChange={(v) => set({ emaxLV: v })} />
            <Slider label="Systemic resistance" value={params.rSys} min={0.4} max={2} step={0.01} unit="mmHg·s/mL" onChange={(v) => set({ rSys: v })} />
            <Slider label="Arterial compliance" value={params.cSa} min={0.4} max={3} step={0.05} unit="mL/mmHg" onChange={(v) => set({ cSa: v })} hint="Lower = stiffer arteries" />
            <Slider label="Stressed blood volume" value={params.stressedVolume} min={450} max={1100} step={5} unit="mL" digits={0} onChange={(v) => set({ stressedVolume: v })} />
            <hr className="border-slate-200 dark:border-slate-800" />
            <Slider label="Valve EOA (open)" value={params.aortic.eoaMax} min={0.4} max={3} step={0.01} unit="cm²" onChange={(v) => setParams(withAortic(params, { eoaMax: v }))} hint="Biohybrid aortic prosthesis" />
            <Slider label="Valve regurgitant orifice" value={params.aortic.roa} min={0} max={0.5} step={0.005} unit="cm²" digits={3} onChange={(v) => setParams(withAortic(params, { roa: v }))} />
            <Slider label="Mitral regurgitant orifice" value={params.mitral.roa} min={0} max={0.5} step={0.005} unit="cm²" digits={3} onChange={(v) => setParams({ ...params, mitral: { ...params.mitral, roa: v } })} />
          </div>
        </Card>
      </aside>

      <div className="xl:col-span-9 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Blood pressure" value={`${f(h.sbp)}/${f(h.dbp)}`} unit="mmHg" sub={`MAP ${f(h.map)}`} />
          <Kpi label="Cardiac output" value={f(h.co, 2)} unit="L/min" sub={`CI ${f(h.co / bsa, 2)} L/min/m²`} />
          <Kpi label="LV ejection fraction" value={f(h.ef)} unit="%" sub={`EDV ${f(h.edv)} / ESV ${f(h.esv)} mL`} />
          <Kpi label="Mean gradient" value={f(h.avMeanGradient, 1)} unit="mmHg" sub={`Peak ${f(h.avPeakGradient)} mmHg`} />
          <Kpi label="Peak velocity" value={f(h.avVmax, 2)} unit="m/s" sub={`DVI ${f(h.dvi, 2)}`} />
          <Kpi label="EOA (Gorlin)" value={f(h.avGorlinEOA, 2)} unit="cm²" sub={`Indexed ${f(h.avGorlinEOA / bsa, 2)} cm²/m²`} />
          <Kpi label="Aortic regurgitation" value={f(h.arRF)} unit="% RF" sub={`${f(h.arVolume, 1)} mL/beat`} />
          <Kpi label="Mitral regurgitation" value={f(h.mrRF)} unit="% RF" sub={`${f(h.mrVolume, 1)} mL/beat`} />
          <Kpi label="LA pressure (mean)" value={f(h.lapMean, 1)} unit="mmHg" sub={`LVEDP ${f(h.edp, 1)}`} />
          <Kpi label="Forward stroke vol." value={f(h.forwardSV)} unit="mL" sub={`SVi ${f(h.forwardSV / bsa)} mL/m²`} />
          <Kpi label="LV stroke work" value={f((h.strokeWork * 1.333e-4), 2)} unit="J" sub={`${f(h.strokeWork / 1000, 1)}k mmHg·mL`} />
          <Kpi label="Ejection time" value={f(h.ejectionTime)} unit="ms" sub={`Mitral gradient ${f(h.mvMeanGradient, 1)}`} />
        </div>

        <Card
          title="Clinical read-out"
          right={<span className="text-xs text-slate-500">Thresholds: ASE 2009 prosthetic valve guideline; ASE regurgitant fraction grading</span>}
        >
          <div className="flex flex-wrap gap-3 text-sm items-center">
            <span>Prosthetic stenosis:</span>
            <Badge grade={as.grade}>{as.label}</Badge>
            <span className="ml-3">Valve regurgitation:</span>
            <Badge grade={ar.grade}>{ar.label}</Badge>
            <span className="ml-3">Mitral regurgitation:</span>
            <Badge grade={mr.grade}>{mr.label}</Badge>
            <span className="ml-3">Indexed EOA (PPM criteria):</span>
            <Badge grade={mm.grade}>
              {mm.label} (iEOA {f(mm.ieoa, 2)})
            </Badge>
          </div>
          {h.avMeanGradient < 40 && as.grade !== "normal" && h.arRF < 30 && h.forwardSV / bsa < 35 && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              Low-flow state (SVi &lt; 35 mL/m²): the mean gradient under-estimates valve obstruction; EOA and DVI are more reliable here.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            title="Pressures over one beat"
            right={
              <div className="flex items-center gap-2">
                <Btn variant="ghost" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "Pause" : "Play"}
                </Btn>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-2 py-1.5"
                >
                  <option value={1}>Real time</option>
                  <option value={0.25}>¼ speed</option>
                  <option value={0.1}>1/10 speed</option>
                </select>
              </div>
            }
          >
            <Plot series={pressureSeries} xLabel="Time in cardiac cycle (ms)" yLabel="Pressure (mmHg)" cursorX={tMs[idx]} />
          </Card>
          <Card title="Pressure–volume loop">
            <Plot series={pvSeries} xLabel="LV volume (mL)" yLabel="LV pressure (mmHg)" cursorIndex={idx} closedLoop />
          </Card>
          <Card title="Transvalvular flow">
            <Plot series={flowSeries} xLabel="Time in cardiac cycle (ms)" yLabel="Flow (mL/s)" cursorX={tMs[idx]} refs={[{ y: 0 }]} />
          </Card>
          <Card
            title="Valve motion"
            right={
              <Btn
                variant="ghost"
                onClick={() =>
                  downloadCSV(
                    "twin_beat.csv",
                    ["t_ms", "p_lv", "p_ao", "p_la", "v_lv", "q_av", "q_mv", "zeta_av", "zeta_mv"],
                    Array.from(tr.t, (_, i) => [
                      f(tMs[i], 1),
                      f(tr.pLV[i], 2),
                      f(tr.pAo[i], 2),
                      f(tr.pLA[i], 2),
                      f(tr.vLV[i], 2),
                      f(tr.qAV[i], 2),
                      f(tr.qMV[i], 2),
                      f(tr.zAV[i], 4),
                      f(tr.zMV[i], 4),
                    ])
                  )
                }
              >
                Download beat CSV
              </Btn>
            }
          >
            <div className="flex justify-around items-center py-2">
              <ValveFace area={aAV} annulus={lvotArea} label="Biohybrid aortic valve" damage={Math.min(1, Math.max(0, 1 - params.aortic.eoaMax / 1.8))} />
              <ValveFace area={aMV} annulus={params.mitral.eoaMax} leaflets={2} label="Native mitral valve" />
            </div>
            <div className="text-xs text-slate-500 mt-2">
              t = {f(tMs[idx])} ms of {f(beatMs)} ms. Valve opening follows the trans-valvular pressure difference (Mynard et al. 2012), so
              opening and closing are gradual rather than instantaneous.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- lifetime tab
const stageColor = ["#10b981", "#84cc16", "#f59e0b", "#e11d48"];

const LifetimeTab: React.FC<{ params: TwinParams; bsa: number }> = ({ params, bsa }) => {
  const [age, setAge] = useState(DEFAULT_LIFETIME.ageAtImplant);
  const [pct, setPct] = useState(DEFAULT_LIFETIME.percentile);
  const [mode, setMode] = useState(DEFAULT_LIFETIME.mode);
  const [selfRepair, setSelfRepair] = useState(0);
  const [policy, setPolicy] = useState<Policy>("none");
  const [restore, setRestore] = useState(DEFAULT_LIFETIME.repairRestore);
  const [res, setRes] = useState<LifetimeResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    const id = setTimeout(() => {
      setRes(
        runLifetime({
          params,
          ageAtImplant: age,
          percentile: pct,
          mode,
          selfRepair,
          policy,
          repairRestore: restore,
          horizon: 25,
          step: 1,
        })
      );
      setBusy(false);
    }, 120);
    return () => clearTimeout(id);
  }, [params, age, pct, mode, selfRepair, policy, restore]);

  const data = useMemo(
    () =>
      res?.points.map((p) => ({
        year: p.year,
        gradient: +p.h.avMeanGradient.toFixed(1),
        eoa: +p.h.avGorlinEOA.toFixed(2),
        rf: +p.h.arRF.toFixed(1),
        ef: +p.h.ef.toFixed(1),
        co: +p.h.co.toFixed(2),
        stage: p.stage,
      })) ?? [],
    [res]
  );

  const cohort = useMemo(() => {
    const rows: Record<string, number | undefined>[] = [];
    for (let t = 0; t <= 25; t += 0.5) {
      rows.push({
        year: t,
        standard: +(freedomFromSVD(t, age) * 100).toFixed(1),
        biohybrid: selfRepair > 0 ? +(freedomFromSVD(t, age, selfRepair) * 100).toFixed(1) : undefined,
        ref51: +(freedomFromSVD(t, 51) * 100).toFixed(1),
        published: CALIBRATION_POINTS.find((c) => c.year === t)?.freedom,
      });
    }
    return rows;
  }, [age, selfRepair]);

  const last = res?.points[res.points.length - 1];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <aside className="xl:col-span-3 space-y-6">
        <Card title="Patient & valve">
          <div className="space-y-3">
            <Slider label="Age at implant" value={age} min={20} max={90} step={1} unit="y" digits={0} onChange={setAge} hint="Younger patients degenerate bioprostheses faster" />
            <Slider
              label="Individual durability percentile"
              value={pct}
              min={0.05}
              max={0.95}
              step={0.01}
              digits={2}
              onChange={setPct}
              hint="0.5 = median patient; 0.1 = valve fails earlier than 90% of the cohort would"
            />
            <Slider label="Failure mechanism" value={mode} min={0} max={1} step={0.05} onChange={setMode} hint="0 = calcific stenosis · 1 = leaflet tear / regurgitation" />
          </div>
        </Card>
        <Card title="Biohybrid & AI repair (hypothetical)">
          <div className="space-y-3">
            <Slider
              label="Living-tissue self-repair"
              value={selfRepair}
              min={0}
              max={0.6}
              step={0.05}
              onChange={setSelfRepair}
              hint="Fraction by which cell-mediated remodelling slows damage accrual"
            />
            <label className="block text-sm">
              <span>AI-triggered repair policy</span>
              <select
                value={policy}
                onChange={(e) => setPolicy(e.target.value as Policy)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
              >
                <option value="none">No intervention</option>
                <option value="stage2">Repair when surveillance detects Stage 2</option>
                <option value="stage3">Repair only at Stage 3</option>
              </select>
            </label>
            <Slider label="Damage reversed per repair" value={restore} min={0.2} max={1} step={0.05} onChange={setRestore} />
            <p className="text-xs text-slate-500">
              These levers are scenario assumptions, not measured device behaviour. No clinical data exist for self-repairing biohybrid valves; use them
              to ask "what would it take" questions.
            </p>
          </div>
        </Card>
      </aside>

      <div className="xl:col-span-9 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Time to severe SVD (T)" value={f(res?.Tp ?? NaN, 1)} unit="years" sub={`median for age ${age}: ${f(20 * Math.exp(0.0302 * (age - 51)) * 0.885 / Math.max(0.05, 1 - selfRepair), 1)} y`} />
          <Kpi label="VARC-3 Stage 2 reached" value={res?.firstStage2 != null ? `${res.firstStage2}` : "> 25"} unit="years" sub={res?.firstStage2 != null ? `age ${age + res.firstStage2}` : "within horizon: no"} />
          <Kpi label="VARC-3 Stage 3 reached" value={res?.firstStage3 != null ? `${res.firstStage3}` : "> 25"} unit="years" sub={res?.firstStage3 != null ? `age ${age + res.firstStage3}` : "within horizon: no"} />
          <Kpi label="Repairs triggered" value={`${res?.repairs.length ?? 0}`} sub={res?.repairs.length ? `at year ${res.repairs.join(", ")}` : "policy: " + policy} />
          <Kpi label="Gradient at 25 y" value={f(last?.h.avMeanGradient ?? NaN, 1)} unit="mmHg" sub={`EOA ${f(last?.h.avGorlinEOA ?? NaN, 2)} cm² · CO ${f(last?.h.co ?? NaN, 1)}`} />
        </div>

        <Card title="Annual echo surveillance simulated by the twin" right={busy ? <span className="text-xs text-slate-500">computing…</span> : null}>
          <div className="h-80">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" type="number" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} fontSize={12} />
                <YAxis yAxisId="g" fontSize={12} label={{ value: "Mean gradient (mmHg)", angle: -90, position: "insideLeft", fontSize: 12, dy: 60 }} />
                <YAxis yAxisId="e" orientation="right" fontSize={12} domain={[0, "auto"]} label={{ value: "EOA (cm²)", angle: 90, position: "insideRight", fontSize: 12 }} />
                <Tooltip />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 18 }} />
                <ReferenceLine yAxisId="g" y={20} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "20 mmHg", fontSize: 10, position: "insideTopLeft" }} />
                <ReferenceLine yAxisId="g" y={30} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "30 mmHg", fontSize: 10, position: "insideTopLeft" }} />
                {res?.repairs.map((y) => (
                  <ReferenceLine key={y} yAxisId="g" x={y} stroke="#7c3aed" label={{ value: "repair", fontSize: 10, position: "insideTopRight" }} />
                ))}
                <Line yAxisId="g" type="linear" dataKey="gradient" name="Mean gradient" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="e" type="linear" dataKey="eoa" name="EOA" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-slate-500">Years after implant</div>
          <div className="flex gap-1 mt-2" aria-label="VARC-3 stage by year">
            {res?.points.map((p) => (
              <div
                key={p.year}
                title={`Year ${p.year}: Stage ${p.stage}`}
                className="flex-1 h-3 rounded-sm"
                style={{ background: stageColor[p.stage] }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-2">
            {["Stage 0: no deterioration", "Stage 1: morphological", "Stage 2: moderate haemodynamic", "Stage 3: severe haemodynamic"].map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: stageColor[i] }} />
                {s}
              </span>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Consequences for the heart">
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" type="number" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} fontSize={12} />
                  <YAxis yAxisId="p" fontSize={12} domain={[0, 100]} />
                  <YAxis yAxisId="c" orientation="right" fontSize={12} domain={[0, 8]} />
                  <Tooltip />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 18 }} />
                  <Line yAxisId="p" dataKey="ef" name="LVEF (%)" stroke="#e11d48" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="p" dataKey="rf" name="Valve regurgitant fraction (%)" stroke="#7c3aed" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="c" dataKey="co" name="Cardiac output (L/min)" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500">
              The LV is held at its current contractility, so these curves show the load the failing valve places on an unchanged heart (no
              remodelling).
            </p>
          </Card>
          <Card title="Cohort durability: freedom from severe SVD">
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={cohort} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" type="number" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} unit="%" />
                  <Tooltip />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 18 }} />
                  <Line dataKey="standard" name={`Model, age ${age}`} stroke="#0f172a" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="ref51" name="Model, age 51" stroke="#94a3b8" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  {selfRepair > 0 && <Line dataKey="biohybrid" name="With self-repair" stroke="#e11d48" dot={false} strokeWidth={2} isAnimationActive={false} />}
                  <Scatter dataKey="published" name="Published, age ≤60 (Bourguignon 2015)" fill="#f59e0b" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500">
              Weibull model (shape 3) calibrated to published freedom from reoperation for SVD; the dots show the calibration data. This patient sits at
              percentile {f(pct * 100)} of the age-{age} cohort.
            </p>
          </Card>
        </div>

        <Card
          title="Year-by-year table"
          right={
            <Btn
              variant="ghost"
              onClick={() =>
                res &&
                downloadCSV(
                  "twin_lifetime.csv",
                  ["year", "age", "damage", "eoa_set", "roa_set", "mean_gradient", "vmax", "eoa_gorlin", "dvi", "ar_rf", "ef", "co", "sbp", "dbp", "varc3_stage", "repaired"],
                  res.points.map((p) => [
                    p.year,
                    p.age,
                    f(p.damage, 3),
                    f(p.eoaSet, 3),
                    f(p.roaSet, 3),
                    f(p.h.avMeanGradient, 2),
                    f(p.h.avVmax, 2),
                    f(p.h.avGorlinEOA, 3),
                    f(p.h.dvi, 3),
                    f(p.h.arRF, 1),
                    f(p.h.ef, 1),
                    f(p.h.co, 2),
                    f(p.h.sbp, 0),
                    f(p.h.dbp, 0),
                    p.stage,
                    p.repaired ? 1 : 0,
                  ])
                )
              }
            >
              Download CSV
            </Btn>
          }
        >
          <div className="overflow-auto max-h-72">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-slate-500 sticky top-0 bg-white dark:bg-slate-950">
                <tr className="text-right">
                  {["Year", "Damage", "Mean grad.", "Vmax", "EOA", "iEOA", "DVI", "AR RF", "LVEF", "CO", "BP", "Stage"].map((c) => (
                    <th key={c} className="px-2 py-1 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res?.points.map((p) => (
                  <tr key={p.year} className={`text-right border-t border-slate-100 dark:border-slate-900 ${p.repaired ? "bg-violet-50 dark:bg-violet-950/30" : ""}`}>
                    <td className="px-2 py-1">{p.year}</td>
                    <td className="px-2 py-1">{f(p.damage * 100)}%</td>
                    <td className="px-2 py-1">{f(p.h.avMeanGradient, 1)}</td>
                    <td className="px-2 py-1">{f(p.h.avVmax, 2)}</td>
                    <td className="px-2 py-1">{f(p.h.avGorlinEOA, 2)}</td>
                    <td className="px-2 py-1">{f(p.h.avGorlinEOA / bsa, 2)}</td>
                    <td className="px-2 py-1">{f(p.h.dvi, 2)}</td>
                    <td className="px-2 py-1">{f(p.h.arRF)}%</td>
                    <td className="px-2 py-1">{f(p.h.ef)}%</td>
                    <td className="px-2 py-1">{f(p.h.co, 1)}</td>
                    <td className="px-2 py-1">
                      {f(p.h.sbp)}/{f(p.h.dbp)}
                    </td>
                    <td className="px-2 py-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ background: stageColor[p.stage] }} />
                      {p.stage}
                      {p.repaired ? " → repaired" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- personalise tab
const EXAMPLE: Measurements = { hr: 72, sbp: 138, dbp: 82, ef: 55, edv: 145, meanGradient: 16, eoa: 1.35, arRF: undefined };

const PersonaliseTab: React.FC<{
  params: TwinParams;
  setParams: (p: TwinParams) => void;
  height: number;
  weight: number;
  setHeight: (v: number) => void;
  setWeight: (v: number) => void;
  goLive: () => void;
}> = ({ params, setParams, height, weight, setHeight, setWeight, goLive }) => {
  const [m, setM] = useState<Measurements>(EXAMPLE);
  const [progress, setProgress] = useState<{ evals: number; cost: number } | null>(null);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [follow, setFollow] = useState<FollowUp[]>([
    { year: 1, meanGradient: 16 },
    { year: 4, meanGradient: 16.8 },
    { year: 7, meanGradient: 19.5 },
  ]);
  const [mode, setMode] = useState(0);
  const [implantAge, setImplantAge] = useState(DEFAULT_LIFETIME.ageAtImplant);
  const [prog, setProg] = useState<PrognosisResult | null>(null);
  const bsa = bsaMosteller(height, weight);

  const run = async () => {
    setBusy(true);
    setFit(null);
    setProg(null);
    const r = await calibrate(params, m, (p) => setProgress({ evals: p.evals, cost: p.cost }));
    setFit(r);
    setBusy(false);
  };

  const runProg = () => {
    const base = fit?.params ?? params;
    setProg(fitPrognosis(base, mode, follow.filter((d) => Number.isFinite(d.year) && Number.isFinite(d.meanGradient))));
  };

  const crossing = (thr: number) => {
    if (!prog) return null;
    const c = prog.curve.find((p) => p.meanGradient >= thr);
    return c ? c.year : null;
  };
  const baseGrad = prog?.curve[0]?.meanGradient ?? 0;
  const s2 = crossing(Math.max(20, baseGrad + 10));
  const s3 = crossing(Math.max(30, baseGrad + 20));

  const progData = useMemo(() => {
    if (!prog) return [];
    const rows: { year: number; predicted?: number; measured?: number }[] = prog.curve.map((c) => ({ year: c.year, predicted: +c.meanGradient.toFixed(1) }));
    follow.forEach((fp) => rows.push({ year: fp.year, measured: fp.meanGradient }));
    return rows.sort((a, b) => a.year - b.year);
  }, [prog, follow]);

  const labels: Record<string, string> = { sbp: "Systolic BP", dbp: "Diastolic BP", ef: "LVEF", edv: "LV EDV", meanGradient: "Mean gradient", eoa: "EOA", arRF: "AR regurgitant fraction" };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-5 space-y-6">
        <Card title="1 · Baseline measurements (echo + cuff)">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Height" value={height} unit="cm" onChange={(v) => v && setHeight(v)} />
            <NumField label="Weight" value={weight} unit="kg" onChange={(v) => v && setWeight(v)} />
            <NumField label="Heart rate" value={m.hr} unit="bpm" onChange={(v) => setM({ ...m, hr: v ?? 70 })} />
            <NumField label="Systolic BP" value={m.sbp} unit="mmHg" optional onChange={(v) => setM({ ...m, sbp: v })} />
            <NumField label="Diastolic BP" value={m.dbp} unit="mmHg" optional onChange={(v) => setM({ ...m, dbp: v })} />
            <NumField label="LVEF" value={m.ef} unit="%" optional onChange={(v) => setM({ ...m, ef: v })} />
            <NumField label="LV end-diastolic volume" value={m.edv} unit="mL" optional onChange={(v) => setM({ ...m, edv: v })} />
            <NumField label="Valve mean gradient" value={m.meanGradient} unit="mmHg" step={0.5} optional onChange={(v) => setM({ ...m, meanGradient: v })} />
            <NumField label="Valve EOA" value={m.eoa} unit="cm²" step={0.05} optional onChange={(v) => setM({ ...m, eoa: v })} />
            <NumField label="AR regurgitant fraction" value={m.arRF} unit="%" optional onChange={(v) => setM({ ...m, arRF: v })} />
          </div>
          <div className="text-xs text-slate-500 mt-2">BSA (Mosteller) {f(bsa, 2)} m². Example values are pre-filled; replace them with a real study.</div>
          <div className="flex items-center gap-3 mt-4">
            <Btn onClick={run} disabled={busy}>
              {busy ? "Calibrating…" : "Calibrate twin"}
            </Btn>
            {progress && (
              <span className="text-xs text-slate-500 tabular-nums">
                {progress.evals} model runs · error {f(progress.cost, 3)}
              </span>
            )}
          </div>
        </Card>

        <Card title="2 · Serial follow-up → personal prognosis">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Enter follow-up mean gradients. The twin fits this patient's deterioration time-scale and forecasts when VARC-3 thresholds would be crossed.
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium">Years after implant</th>
                <th className="text-left font-medium">Mean gradient (mmHg)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {follow.map((r, i) => (
                <tr key={i}>
                  {(["year", "meanGradient"] as const).map((k) => (
                    <td key={k} className="pr-2 py-1">
                      <input
                        type="number"
                        step={k === "year" ? 0.5 : 0.1}
                        value={r[k]}
                        onChange={(e) => setFollow(follow.map((x, j) => (j === i ? { ...x, [k]: parseFloat(e.target.value) } : x)))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 tabular-nums"
                      />
                    </td>
                  ))}
                  <td>
                    <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => setFollow(follow.filter((_, j) => j !== i))}>
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Btn variant="ghost" onClick={() => setFollow([...follow, { year: (follow[follow.length - 1]?.year ?? 0) + 1, meanGradient: follow[follow.length - 1]?.meanGradient ?? 15 }])}>
              Add row
            </Btn>
            <label className="text-sm flex items-center gap-2">
              Age at implant
              <input
                type="number"
                value={implantAge}
                onChange={(e) => setImplantAge(parseFloat(e.target.value) || 55)}
                className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 tabular-nums"
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              Mechanism
              <select value={mode} onChange={(e) => setMode(parseFloat(e.target.value))} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
                <option value={0}>Calcific stenosis</option>
                <option value={0.25}>Mixed, stenosis-dominant</option>
              </select>
            </label>
            <Btn onClick={runProg} disabled={follow.length < 2}>
              Fit prognosis
            </Btn>
          </div>
          {!fit && <p className="text-xs text-slate-500 mt-2">Tip: calibrate step 1 first, so the forecast uses this patient's heart rather than the default twin.</p>}
        </Card>
      </div>

      <div className="xl:col-span-7 space-y-6">
        <Card
          title="Calibration result"
          right={
            fit && (
              <Btn
                onClick={() => {
                  setParams(fit.params);
                  goLive();
                }}
              >
                Use calibrated twin
              </Btn>
            )
          }
        >
          {!fit && <p className="text-sm text-slate-500">Run the calibration to fit the twin to the measurements. It takes about a second.</p>}
          {fit && (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Fit to measurements</h3>
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-slate-500">
                    <tr className="text-right">
                      <th className="text-left font-medium">Quantity</th>
                      <th className="font-medium">Measured</th>
                      <th className="font-medium">Twin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fit.residuals.map((r) => (
                      <tr key={r.key} className="text-right border-t border-slate-100 dark:border-slate-900">
                        <td className="text-left py-1">{labels[r.key]}</td>
                        <td>{f(r.measured, r.key === "eoa" ? 2 : 1)}</td>
                        <td className={Math.abs(r.z) > 1 ? "text-amber-600" : ""}>{f(r.simulated, r.key === "eoa" ? 2 : 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-2">
                  {fit.evals} model evaluations · weighted error {f(fit.cost, 3)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Estimated hidden parameters</h3>
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-slate-500">
                    <tr className="text-right">
                      <th className="text-left font-medium">Parameter</th>
                      <th className="font-medium">Default</th>
                      <th className="font-medium">Patient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIT_PARAMS.map((d) => (
                      <tr key={d.name} className="text-right border-t border-slate-100 dark:border-slate-900">
                        <td className="text-left py-1">{d.name}</td>
                        <td>{f(d.get(DEFAULT_PARAMS), 3)}</td>
                        <td>{f(d.get(fit.params), 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-2">
                  Derived: CO {f(fit.haemo.co, 2)} L/min, LA pressure {f(fit.haemo.lapMean, 1)} mmHg, DVI {f(fit.haemo.dvi, 2)}, iEOA{" "}
                  {f(fit.haemo.avGorlinEOA / bsa, 2)} cm²/m² ({ppm(fit.haemo.avGorlinEOA, bsa).label}).
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card title="Personal prognosis">
          {!prog && <p className="text-sm text-slate-500">Enter at least two follow-up studies and press "Fit prognosis".</p>}
          {prog && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Kpi label="Fitted time-scale T" value={f(prog.T, 1)} unit="years" sub={`fit RMSE ${f(prog.rmse, 2)} mmHg`} />
                <Kpi label="Forecast Stage 2" value={s2 != null ? f(s2, 1) : "> 25"} unit="years" sub="gradient ≥20 and +10" />
                <Kpi label="Forecast Stage 3" value={s3 != null ? f(s3, 1) : "> 25"} unit="years" sub="gradient ≥30 and +20" />
                <Kpi
                  label="Cohort percentile"
                  value={f(percentileOfT(implantAge, prog.T) * 100)}
                  sub={`earlier than this share of the age-${implantAge} cohort`}
                />
              </div>
              <div className="h-72">
                <ResponsiveContainer>
                  <ComposedChart data={progData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" type="number" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} fontSize={12} />
                    <YAxis fontSize={12} domain={[0, 80]} />
                    <Tooltip />
                    <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 18 }} />
                    <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="4 4" />
                    <ReferenceLine y={30} stroke="#e11d48" strokeDasharray="4 4" />
                    <Line dataKey="predicted" name="Twin forecast" stroke="#e11d48" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
                    <Scatter dataKey="measured" name="Measured" fill="#0f172a" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500">
                The forecast assumes the damage law d = (t/T)³ and the calibrated twin's damage → gradient relation; few early points leave T uncertain, so
                treat the forecast as a hypothesis to check at the next study.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- methods tab
const REFS: { text: string; url: string }[] = [
  { text: "Mynard JP, Davidson MR, Penny DJ, Smolich JJ. A simple, versatile valve model for use in lumped parameter and one-dimensional cardiovascular models. Int J Numer Method Biomed Eng 2012;28:626–641.", url: "https://doi.org/10.1002/cnm.1466" },
  { text: "Stergiopulos N, Meister JJ, Westerhof N. Determinants of stroke volume and systolic and diastolic aortic pressure. Am J Physiol 1996;270:H2050–H2059.", url: "https://doi.org/10.1152/ajpheart.1996.270.6.H2050" },
  { text: "Suga H, Sagawa K. Instantaneous pressure–volume relationships and their ratio in the excised, supported canine left ventricle. Circ Res 1974;35:117–126.", url: "https://doi.org/10.1161/01.RES.35.1.117" },
  { text: "Westerhof N, Lankhaar JW, Westerhof BE. The arterial Windkessel. Med Biol Eng Comput 2009;47:131–141.", url: "https://doi.org/10.1007/s11517-008-0359-2" },
  { text: "Gorlin R, Gorlin SG. Hydraulic formula for calculation of the area of the stenotic mitral valve, other cardiac valves, and central circulatory shunts. Am Heart J 1951;41:1–29.", url: "https://doi.org/10.1016/0002-8703(51)90002-6" },
  { text: "Zoghbi WA et al. Recommendations for evaluation of prosthetic valves with echocardiography and Doppler ultrasound. J Am Soc Echocardiogr 2009;22:975–1014.", url: "https://doi.org/10.1016/j.echo.2009.07.013" },
  { text: "VARC-3 Writing Committee, Généreux P et al. Valve Academic Research Consortium 3: updated endpoint definitions for aortic valve clinical research. Eur Heart J 2021;42:1825–1857.", url: "https://doi.org/10.1093/eurheartj/ehaa799" },
  { text: "Bourguignon T et al. Very long-term outcomes of the Carpentier-Edwards Perimount valve in aortic position. Ann Thorac Surg 2015;100:853–859.", url: "https://pubmed.ncbi.nlm.nih.gov/26187006/" },
  { text: "Johnston DR et al. Long-term durability of bioprosthetic aortic valves: implications from 12,569 implants. Ann Thorac Surg 2015;99:1239–1247.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5132179/" },
  { text: "Lagarias JC, Reeds JA, Wright MH, Wright PE. Convergence properties of the Nelder–Mead simplex method in low dimensions. SIAM J Optim 1998;9:112–147.", url: "https://doi.org/10.1137/S1052623496303470" },
  { text: "Corral-Acero J et al. The 'Digital Twin' to enable the vision of precision cardiology. Eur Heart J 2020;41:4556–4564.", url: "https://doi.org/10.1093/eurheartj/ehaa159" },
];

const MethodsTab: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Card title="What the twin computes">
      <div className="prose-sm space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <p>
          A closed-loop, lumped-parameter model of the left heart and systemic circulation, solved every 0.2 ms until the beat is periodic. Every number on
          the Live tab comes from that solution, not from a lookup table or random generator.
        </p>
        <ul className="list-disc ms-5 space-y-1.5">
          <li>
            <b>Ventricle and atrium:</b> time-varying elastance P = e(t)·Ees·(V − V₀) + (1 − e(t))·A·(e^(β(V−V₀)) − 1), with the double-Hill activation
            e(t) (Stergiopulos 1996) and an exponential end-diastolic pressure–volume relation.
          </li>
          <li>
            <b>Arterial load:</b> 3-element Windkessel (characteristic impedance Zc, compliance C, resistance R); veins and lungs are one compliant
            reservoir returning to the left atrium.
          </li>
          <li>
            <b>Valves:</b> Mynard 2012 model: Δp = B·q|q| + L·dq/dt with B = ρ/2A² and L = ρℓ/A. The orifice area A = (A_max − A_min)·ζ + A_min, and
            the valve state ζ opens and closes in response to Δp. Stenosis lowers A_max; regurgitation raises A_min.
          </li>
          <li>
            <b>Clinical indices:</b> Doppler-equivalent gradients (4v²), peak velocity, Gorlin EOA = Q̄ / (44.3·√ΔP̄), Doppler velocity index (LVOT
            VTI / jet VTI), regurgitant fraction, PV-loop stroke work, and indexed EOA for patient–prosthesis mismatch.
          </li>
          <li>
            <b>Lifetime:</b> Weibull time to severe structural valve deterioration (shape 3, age-dependent scale) calibrated to published durability
            data. Individual damage d = (t/T)³ narrows the orifice and/or opens a regurgitant gap, and the twin is re-solved at each annual study. VARC-3
            stages are then assigned from the simulated echo.
          </li>
          <li>
            <b>Personalisation:</b> Nelder–Mead inverse solution for six hidden parameters from routine measurements; then a one-parameter fit of the
            deterioration time-scale to serial gradients for an individual forecast.
          </li>
        </ul>
      </div>
    </Card>
    <Card title="Validation against normal physiology (default twin)">
      <ValidationTable />
    </Card>
    <Card title="Limitations">
      <ul className="list-disc ms-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        <li>Research and teaching simulation. Not a medical device, not validated for clinical decisions.</li>
        <li>No right heart, coronary circulation, baroreflex or LV remodelling; heart rate and contractility do not adapt to the failing valve.</li>
        <li>
          The durability law is calibrated to reoperation data for one surgical bioprosthesis family. Real valves vary by design, position and patient
          risk factors.
        </li>
        <li>
          "Biohybrid self-repair" and "AI-triggered repair" are hypothetical levers. No implanted self-repairing valve or nanorobotic repair data
          exist yet, so their size is a user assumption.
        </li>
        <li>Gradients are noise-free model values; real echo carries a few mmHg of measurement variability.</li>
      </ul>
    </Card>
    <Card title="References">
      <ol className="list-decimal ms-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        {REFS.map((r) => (
          <li key={r.url}>
            {r.text}{" "}
            <a href={r.url} target="_blank" rel="noreferrer" className="text-rose-600 hover:underline">
              link
            </a>
          </li>
        ))}
      </ol>
    </Card>
  </div>
);

const ValidationTable: React.FC = () => {
  const h = useMemo<Haemodynamics>(() => simulate(DEFAULT_PARAMS).haemo, []);
  const rows: [string, string, string][] = [
    ["Systolic / diastolic BP", `${f(h.sbp)}/${f(h.dbp)} mmHg`, "~120/80 mmHg"],
    ["Cardiac output (HR 70)", `${f(h.co, 1)} L/min`, "4–8 L/min"],
    ["LV EDV / ESV", `${f(h.edv)} / ${f(h.esv)} mL`, "~100–160 / 35–70 mL"],
    ["LVEF", `${f(h.ef)} %`, "52–72 %"],
    ["Mean LA pressure", `${f(h.lapMean, 1)} mmHg`, "6–12 mmHg"],
    ["Ejection time", `${f(h.ejectionTime)} ms`, "250–330 ms"],
    ["Bioprosthesis mean gradient (EOA 1.8 cm²)", `${f(h.avMeanGradient, 1)} mmHg`, "< 20 mmHg (ASE normal)"],
    ["Gorlin EOA recovered from flow and gradient", `${f(h.avGorlinEOA, 2)} cm²`, "matches set EOA 1.80"],
  ];
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-xs text-slate-500">
        <tr>
          <th className="text-left font-medium">Quantity</th>
          <th className="text-left font-medium">Twin</th>
          <th className="text-left font-medium">Reference range</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]} className="border-t border-slate-100 dark:border-slate-900">
            <td className="py-1">{r[0]}</td>
            <td>{r[1]}</td>
            <td className="text-slate-500">{r[2]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ---------------------------------------------------------------- app
type Tab = "live" | "lifetime" | "personalise" | "methods";
const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live haemodynamics" },
  { id: "lifetime", label: "Lifetime & durability" },
  { id: "personalise", label: "Personalise (inverse model)" },
  { id: "methods", label: "Methods & references" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [params, setParams] = useState<TwinParams>(DEFAULT_PARAMS);
  const [height, setHeight] = useState(172);
  const [weight, setWeight] = useState(78);
  const bsa = bsaMosteller(height, weight);
  const calibrated = params !== DEFAULT_PARAMS;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-50/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-[1400px] px-4 pt-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Biohybrid Heart Valve Digital Twin</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Physics-based simulation of a biohybrid aortic valve: beat-by-beat haemodynamics, lifetime durability and patient-specific calibration
              </p>
            </div>
            <div className="text-xs text-slate-500">
              BSA {f(bsa, 2)} m² · {calibrated ? "custom twin" : "default twin"}
              {calibrated && (
                <button className="ml-2 text-rose-600 hover:underline" onClick={() => setParams(DEFAULT_PARAMS)}>
                  reset
                </button>
              )}
            </div>
          </div>
          <nav className="flex gap-1 mt-3 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
                  tab === t.id ? "border-rose-600 text-rose-700 dark:text-rose-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 mt-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-4 py-2 text-xs">
          Research simulation, not for clinical use. Haemodynamics come from published cardiovascular models; self-repair and AI-repair behaviour of
          biohybrid valves is hypothetical and labelled as such.
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {tab === "live" && <LiveTab params={params} setParams={setParams} bsa={bsa} />}
        {tab === "lifetime" && <LifetimeTab params={params} bsa={bsa} />}
        {tab === "personalise" && (
          <PersonaliseTab
            params={params}
            setParams={setParams}
            height={height}
            weight={weight}
            setHeight={setHeight}
            setWeight={setWeight}
            goLive={() => setTab("live")}
          />
        )}
        {tab === "methods" && <MethodsTab />}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Md Abu Sufian · MIT License</p>
          <a href="https://github.com/datascintist-abusufian/biohybrid-heart-valve" className="hover:underline">
            View source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
