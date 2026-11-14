import { memo, useMemo } from 'react';
import type { ScenarioParams, SimulationPhase, SimulationResult } from '../types';

const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/** 1 keV ≈ 11,6 millions de kelvins. */
const KEV_TO_MILLION_DEGREES = 11.6;

export function formatDuration(seconds: number): string {
  if (seconds < 120) return `${dec.format(seconds)} s`;
  if (seconds < 7200) return `${dec.format(seconds / 60)} min`;
  return `${dec.format(seconds / 3600)} h`;
}

interface Series {
  label: string;
  color: string;
  values: number[];
  format: (v: number) => string;
}

interface ChartProps {
  title: string;
  series: Series[];
  phases: SimulationPhase[];
  index: number;
}

const W = 300;
const H = 64;

/** Les tracés ne dépendent pas du curseur : ils sont mémorisés à part. */
const ChartLines = memo(function ChartLines({ series, phases }: Pick<ChartProps, 'series' | 'phases'>) {
  const { paths, zeroY } = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    const min = Math.min(0, ...all);
    const max = Math.max(1e-9, ...all);
    const y = (v: number) => H - 2 - ((v - min) / (max - min)) * (H - 4);
    const last = series[0].values.length - 1;
    return {
      zeroY: y(0),
      paths: series.map((s) => s.values.map((v, i) => `${((i / last) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ')),
    };
  }, [series]);
  const last = series[0].values.length - 1;

  return (
    <>
      {phases.map((p, k) =>
        k % 2 === 1 ? (
          <rect
            key={p.id}
            x={(p.startIndex / last) * W}
            width={((p.endIndex - p.startIndex) / last) * W}
            y={0}
            height={H}
            fill="#ffffff"
            opacity={0.04}
          />
        ) : null,
      )}
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="#3a4a61" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {paths.map((points, i) => (
        <polyline
          key={series[i].label}
          points={points}
          fill="none"
          stroke={series[i].color}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
});

function Chart({ title, series, phases, index }: ChartProps) {
  const last = series[0].values.length - 1;
  const x = (index / last) * W;
  return (
    <div className="chart">
      <div className="chart-head">
        <span>{title}</span>
        <span className="chart-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label} <b>{s.format(s.values[index])}</b>
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
        <ChartLines series={series} phases={phases} />
        <line x1={x} x2={x} y1={0} y2={H} stroke="#e6ebf2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const SCENARIO_FIELDS: { key: Exclude<keyof ScenarioParams, 'mode'>; label: string; min: number; max: number; step: number }[] = [
  { key: 'premagDuration', label: 'Pré-magnétisation', min: 5, max: 600, step: 5 },
  { key: 'rampUpDuration', label: 'Montée du courant', min: 2, max: 600, step: 2 },
  { key: 'heatingDuration', label: 'Chauffage', min: 2, max: 600, step: 2 },
  { key: 'flatTopDuration', label: 'Plateau de combustion', min: 5, max: 86400, step: 5 },
  { key: 'rampDownDuration', label: 'Descente', min: 2, max: 600, step: 2 },
  { key: 'dwellDuration', label: 'Repos', min: 5, max: 3600, step: 5 },
];

interface Props {
  result: SimulationResult | null;
  /** Indice de l'échantillon affiché. */
  index: number;
  playing: boolean;
  speed: number;
  scenario: ScenarioParams;
  onPlayToggle: () => void;
  onSeek: (index: number) => void;
  onSpeed: (speed: number) => void;
  onScenario: (scenario: ScenarioParams) => void;
}

export function SimulationPanel(props: Props) {
  const { result, index, playing, speed, scenario, onPlayToggle, onSeek, onSpeed, onScenario } = props;

  const charts = useMemo(() => {
    if (!result) return null;
    const s = result.samples;
    const percent = (v: number) => pct.format(v);
    const megawatts = (v: number) => `${num.format(v)} MW`;
    return [
      {
        title: 'Courants',
        series: [
          { label: 'Plasma', color: '#ff4fd8', values: s.plasmaCurrent, format: percent },
          { label: 'Solénoïde', color: '#e6c84a', values: s.solenoidCurrent, format: percent },
        ],
      },
      {
        title: 'Température du plasma',
        series: [
          {
            label: '',
            color: '#e8833a',
            values: s.temperature,
            format: (v: number) => `${num.format(v * KEV_TO_MILLION_DEGREES)} M°C`,
          },
        ],
      },
      {
        title: 'Puissances',
        series: [
          { label: 'Fusion', color: '#d94f4f', values: s.fusionPower, format: megawatts },
          { label: 'Chauffage', color: '#4f8fd9', values: s.auxPower, format: megawatts },
        ],
      },
      {
        title: 'Électricité',
        series: [
          { label: 'Brute', color: '#7a7f8c', values: s.grossElectric, format: megawatts },
          { label: 'Nette', color: '#3fbf7f', values: s.netElectric, format: megawatts },
        ],
      },
    ];
  }, [result]);

  if (!result || !charts) return <p className="muted">Calcul de la simulation…</p>;

  const last = result.samples.time.length - 1;
  const i = Math.min(index, last);
  const phase = result.phases.find((p) => i < p.endIndex) ?? result.phases[result.phases.length - 1];
  const { summary } = result;
  const tritium = summary.tritiumPerPulse;

  return (
    <>
      <div className="phase">
        <span className="muted">
          Phase {result.phases.indexOf(phase) + 1}/{result.phases.length} · t = {formatDuration(result.samples.time[i])}
        </span>
        <b>{phase.label}</b>
        <p>{phase.description}</p>
      </div>

      <div className="transport">
        <button onClick={onPlayToggle} aria-label={playing ? 'Pause' : 'Lecture'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          aria-label="Position dans le cycle"
          min={0}
          max={last}
          step={1}
          value={i}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <select aria-label="Vitesse" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          <option value={0.25}>×0,25</option>
          <option value={0.5}>×0,5</option>
          <option value={1}>×1</option>
          <option value={2}>×2</option>
        </select>
      </div>

      {charts.map((c) => (
        <Chart key={c.title} title={c.title} series={c.series} phases={result.phases} index={i} />
      ))}
      <p className="muted small">Chaque phase occupe la même largeur : l'axe horizontal n'est pas à l'échelle du temps.</p>

      <h2>Bilan du cycle</h2>
      <dl className="indicators">
        <dt>Durée du cycle</dt>
        <dd>{formatDuration(summary.cycleDuration)}</dd>
        <dt>Part du temps en combustion</dt>
        <dd>{pct.format(summary.dutyFactor)}</dd>
        <dt>Puissance nette moyenne</dt>
        <dd>{num.format(summary.averageNetPower)} MW</dd>
        <dt>Énergie nette par cycle</dt>
        <dd>{dec.format(summary.netEnergy)} MWh</dd>
        <dt>Tritium consommé</dt>
        <dd>{tritium < 1 ? `${dec.format(tritium * 1000)} mg` : `${dec.format(tritium)} g`}</dd>
        <dt>Temps de confinement</dt>
        <dd>{dec.format(summary.confinementTime)} s</dd>
      </dl>

      <h2>Mode de fonctionnement</h2>
      <div className="segmented" role="group" aria-label="Mode de fonctionnement">
        <button className={scenario.mode === 'steady' ? '' : 'active'} onClick={() => onScenario({ ...scenario, mode: 'pulsed' })}>
          Pulsé
        </button>
        <button className={scenario.mode === 'steady' ? 'active' : ''} onClick={() => onScenario({ ...scenario, mode: 'steady' })}>
          Continu
        </button>
      </div>
      <p className="muted small">
        {scenario.mode === 'steady'
          ? "Le courant est entretenu sans le solénoïde : la durée du plateau n'est plus limitée. Le chauffage du bilan doit inclure l'entraînement du courant."
          : "Le solénoïde induit le courant : le plateau s'arrête quand il arrive en bout de course."}
      </p>

      <h2>Durée des phases</h2>
      {SCENARIO_FIELDS.map((f) => (
        <label key={f.key} className="slider">
          <span className="slider-head">
            <span>{f.label}</span>
            <output>{formatDuration(scenario[f.key])}</output>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={scenario[f.key]}
            onChange={(e) => onScenario({ ...scenario, [f.key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </>
  );
}
