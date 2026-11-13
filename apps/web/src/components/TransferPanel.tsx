import type { Coolant, OptimizationResult, TransferDesign, TransferResult } from '../types';

const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0, signDisplay: 'always' });

/** Écart minimal entre le condenseur et l'air ambiant (K), comme dans l'API. */
const MIN_CONDENSER_APPROACH = 5;

interface Props {
  design: TransferDesign;
  result: TransferResult | null;
  coolants: Coolant[];
  optimization: OptimizationResult | null;
  optimizing: boolean;
  onDesign: (design: TransferDesign) => void;
  onOptimize: () => void;
  /** Reporte le rendement et le pompage obtenus dans le bilan simplifié et la simulation. */
  onReport: () => void;
}

export function TransferPanel(props: Props) {
  const { design, result, coolants, optimization, optimizing, onDesign, onOptimize, onReport } = props;
  const coolant = coolants.find((c) => c.id === design.coolant);
  if (!result || !coolant) return <p className="muted">Calcul de la chaîne de transfert…</p>;

  const net = result.electric.net;
  const rec = result.electric.recirculating;

  const sliders = [
    {
      key: 'inletTemperature' as const,
      label: 'Entrée couverture',
      min: coolant.minInlet,
      max: Math.min(coolant.maxInlet, design.outletTemperature - coolant.minDeltaT),
    },
    {
      key: 'outletTemperature' as const,
      label: 'Sortie couverture',
      min: design.inletTemperature + coolant.minDeltaT,
      max: coolant.maxOutlet,
    },
    {
      key: 'condenserTemperature' as const,
      label: 'Condenseur',
      min: design.ambientTemperature + MIN_CONDENSER_APPROACH,
      max: 80,
    },
    { key: 'ambientTemperature' as const, label: 'Air ambiant', min: 0, max: 40 },
  ];

  const change = (key: (typeof sliders)[number]['key'], value: number) => {
    const next = { ...design, [key]: value };
    // Le condenseur ne peut pas descendre sous l'ambiante.
    next.condenserTemperature = Math.max(next.condenserTemperature, next.ambientTemperature + MIN_CONDENSER_APPROACH);
    onDesign(next);
  };

  const changeCoolant = (id: string) => {
    const c = coolants.find((item) => item.id === id);
    if (!c) return;
    onDesign({
      ...design,
      coolant: c.id,
      inletTemperature: Math.max(c.minInlet, c.maxOutlet - c.deltaTRef),
      outletTemperature: c.maxOutlet,
    });
  };

  return (
    <>
      <div className={net >= 0 ? 'net positive' : 'net negative'}>
        <span>Électricité nette</span>
        <b>{num.format(net)} MW</b>
        <span className="muted">
          {net >= 0 ? `${pct.format(result.plantEfficiency)} de la puissance de fusion` : 'La centrale soutire au réseau'}
        </span>
      </div>

      <h2>Réglage</h2>
      <label className="slider">
        <span className="slider-head">
          <span>Caloporteur</span>
        </span>
        <select className="select" value={design.coolant} onChange={(e) => changeCoolant(e.target.value)}>
          {coolants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{coolant.maturity}</p>
      {sliders.map((s) => (
        <label key={s.key} className="slider">
          <span className="slider-head">
            <span>{s.label}</span>
            <output>{dec.format(design[s.key])} °C</output>
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={0.5}
            value={design[s.key]}
            onChange={(e) => change(s.key, Number(e.target.value))}
          />
        </label>
      ))}

      <dl className="indicators">
        <dt>Débit du caloporteur</dt>
        <dd>{num.format(result.primary.massFlow)} kg/s</dd>
        <dt>Rendement du cycle</dt>
        <dd>{pct.format(result.cycle.efficiency)}</dd>
        <dt>Limite de Carnot</dt>
        <dd>{pct.format(result.cycle.carnotEfficiency)}</dd>
        <dt>Électricité brute</dt>
        <dd>{num.format(result.electric.gross)} MW</dd>
        <dt>Pompage primaire</dt>
        <dd>{dec.format(rec.primaryPumps)} MW</dd>
        <dt>Refroidissement</dt>
        <dd>{dec.format(rec.cooling)} MW</dd>
        <dt>Chaleur rejetée</dt>
        <dd>{num.format(result.heat.rejected)} MW</dd>
      </dl>

      <h2>Optimisation</h2>
      <p className="muted small">
        Cherche, pour chaque caloporteur, les températures qui donnent le plus d'électricité nette, dans les limites des matériaux.
      </p>
      <button className="primary" onClick={onOptimize} disabled={optimizing}>
        {optimizing ? 'Optimisation…' : 'Optimiser'}
      </button>

      {optimization?.candidates.map(({ result: best, activeLimits }, rank) => {
        const d = best.design;
        const gain = best.electric.net - net;
        const applied =
          d.coolant === design.coolant &&
          d.inletTemperature === design.inletTemperature &&
          d.outletTemperature === design.outletTemperature &&
          d.condenserTemperature === design.condenserTemperature;
        return (
          <div key={d.coolant} className={rank === 0 ? 'candidate best' : 'candidate'}>
            <div className="candidate-head">
              <b>{best.coolant.label}</b>
              <span>
                {num.format(best.electric.net)} MW{' '}
                <span className={gain >= 0.5 ? 'gain up' : gain <= -0.5 ? 'gain down' : 'gain'}>
                  {Math.abs(gain) < 0.5 ? '=' : `${signed.format(gain)} MW`}
                </span>
              </span>
            </div>
            <p className="small">
              {dec.format(d.inletTemperature)} → {dec.format(d.outletTemperature)} °C · condenseur {dec.format(d.condenserTemperature)} °C ·
              cycle {pct.format(best.cycle.efficiency)}
            </p>
            {activeLimits.map((limit) => (
              <p key={limit} className="muted small">
                {limit}
              </p>
            ))}
            <p className="muted small">{best.coolant.maturity}</p>
            <button onClick={() => onDesign(d)} disabled={applied}>
              {applied ? 'Réglage appliqué' : 'Appliquer ce réglage'}
            </button>
          </div>
        );
      })}

      <h2>Cohérence avec le reste</h2>
      <p className="muted small">
        Reporte ce rendement ({pct.format(result.equivalent.thermalEfficiency)}) et ce pompage dans le bilan simplifié et la simulation.
      </p>
      <button onClick={onReport}>Reporter dans le bilan</button>
    </>
  );
}
