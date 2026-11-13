import type { MagnetId, MagnetTechnology, Objective, PlantEvaluation, PlantOptimization } from '../types';

const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

const OBJECTIVES: { id: Objective; label: string; hint: string }[] = [
  { id: 'efficiency', label: 'Rendement de la chaîne', hint: 'Électricité nette par MW de fusion : la meilleure conversion entrée → sortie.' },
  { id: 'net', label: 'Électricité nette', hint: 'Le plus de MW livrés au réseau, dans la taille autorisée.' },
  { id: 'specific', label: 'Électricité par tonne', hint: 'Le plus de MW par tonne de machine : un indicateur de coût.' },
];

export interface PlantOptions {
  objective: Objective;
  magnet: MagnetId;
  maxMajorRadius: number;
}

interface Row {
  label: string;
  value: (e: PlantEvaluation) => string;
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Géométrie',
    rows: [
      { label: 'Grand rayon', value: (e) => `${dec2.format(e.params.majorRadius)} m` },
      { label: 'Petit rayon', value: (e) => `${dec2.format(e.params.minorRadius)} m` },
      { label: 'Élongation', value: (e) => dec2.format(e.params.elongation) },
      { label: 'Couverture', value: (e) => `${dec2.format(e.params.blanketThickness)} m` },
      { label: 'Blindage', value: (e) => `${dec2.format(e.params.shieldThickness)} m` },
      { label: 'Bobines toroïdales', value: (e) => `${dec2.format(e.params.tfCoilThickness)} m` },
      { label: 'Masse de la machine', value: (e) => `${num.format(e.mass)} t` },
    ],
  },
  {
    title: 'Plasma',
    rows: [
      { label: "Champ sur l'axe", value: (e) => `${dec1.format(e.plasma.fieldOnAxis)} T` },
      { label: 'Courant plasma', value: (e) => `${dec1.format(e.plasma.current)} MA` },
      { label: 'Température', value: (e) => `${num.format(e.plasma.temperature * 11.6)} M°C` },
      { label: 'Puissance de fusion', value: (e) => `${num.format(e.plasma.fusionPower)} MW` },
      { label: 'Chauffage nécessaire', value: (e) => `${num.format(e.plasma.auxPower)} MW` },
      { label: 'Gain du plasma Q', value: (e) => dec1.format(e.plasma.gain) },
    ],
  },
  {
    title: 'Centrale',
    rows: [
      { label: 'Circuit primaire', value: (e) => `${num.format(e.transfer.design.inletTemperature)} → ${num.format(e.transfer.design.outletTemperature)} °C` },
      { label: 'Rendement du cycle', value: (e) => pct.format(e.transfer.cycle.efficiency) },
      { label: 'Électricité brute', value: (e) => `${num.format(e.transfer.electric.gross)} MW` },
      { label: 'Consommation interne', value: (e) => `${num.format(e.transfer.electric.recirculating.total)} MW` },
      { label: 'Électricité nette', value: (e) => `${num.format(e.netElectric)} MW` },
      { label: 'Rendement de la chaîne', value: (e) => pct.format(e.plantEfficiency) },
      { label: 'Électricité par tonne', value: (e) => `${dec1.format(e.netPerTonne)} kW/t` },
    ],
  },
];

interface Props {
  options: PlantOptions;
  magnets: MagnetTechnology[];
  result: PlantOptimization | null;
  loading: boolean;
  error: string | null;
  onOptions: (options: PlantOptions) => void;
  onRun: () => void;
  onApply: (optimum: PlantEvaluation) => void;
  onClose: () => void;
}

export function OptimizerOverlay({ options, magnets, result, loading, error, onOptions, onRun, onApply, onClose }: Props) {
  const objective = OBJECTIVES.find((o) => o.id === options.objective) ?? OBJECTIVES[0];
  const baseline = result?.baseline ?? null;
  const optimum = result?.optimum ?? null;

  return (
    <div className="overlay" role="dialog" aria-label="Optimisation du réacteur">
      <div className="overlay-card">
        <header className="overlay-head">
          <div>
            <h1>Optimisation du réacteur</h1>
            <p className="muted">Toute la chaîne, de la géométrie à l'électricité livrée au réseau.</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">✕</button>
        </header>

        <div className="overlay-options">
          <label>
            Objectif
            <select className="select" value={options.objective} onChange={(e) => onOptions({ ...options, objective: e.target.value as Objective })}>
              {OBJECTIVES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            Aimants
            <select className="select" value={options.magnet} onChange={(e) => onOptions({ ...options, magnet: e.target.value as MagnetId })}>
              {magnets.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <label>
            Grand rayon maximal : {dec1.format(options.maxMajorRadius)} m
            <input
              type="range"
              min={3}
              max={15}
              step={0.5}
              value={options.maxMajorRadius}
              onChange={(e) => onOptions({ ...options, maxMajorRadius: Number(e.target.value) })}
            />
          </label>
          <button className="primary" onClick={onRun} disabled={loading}>
            {loading ? 'Optimisation…' : result ? 'Relancer' : 'Optimiser'}
          </button>
        </div>
        <p className="muted small">{objective.hint}</p>

        {error && <div className="error inline" role="alert">{error}</div>}
        {result?.baselineError && <p className="muted small">Réacteur actuel non évaluable : {result.baselineError}</p>}

        {result && (
          <>
            <table className="compare">
              <thead>
                <tr>
                  <th />
                  <th>Actuel</th>
                  <th>Optimisé</th>
                </tr>
              </thead>
              {SECTIONS.map((section) => (
                <tbody key={section.title}>
                  <tr className="section">
                    <td colSpan={3}>{section.title}</td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{baseline ? row.value(baseline) : '—'}</td>
                      <td className="strong">{optimum ? row.value(optimum) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tbody>
                <tr className="section">
                  <td colSpan={3}>Contraintes</td>
                </tr>
                {(optimum ?? baseline)?.constraints.map((c, i) => {
                  const cell = (e: PlantEvaluation | null) => {
                    const item = e?.constraints[i];
                    if (!item) return '—';
                    return `${item.ok ? '✓' : '✗'} ${dec2.format(item.value)} ${item.unit}`;
                  };
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.label} <span className="muted">(max {dec2.format(c.limit)})</span>
                      </td>
                      <td className={baseline && !baseline.constraints[i].ok ? 'bad' : ''}>{cell(baseline)}</td>
                      <td className="strong">{cell(optimum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h2>Ce qui borne l'optimum</h2>
            <ul className="limits">
              {result.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p className="muted small">
              {num.format(result.evaluations)} réacteurs évalués. Caloporteur conservé : {(optimum ?? baseline)?.transfer.coolant.label}. Modèle
              par lois d'échelle : ordres de grandeur, pas un dimensionnement.
            </p>

            <div className="overlay-actions">
              <button onClick={onClose}>Fermer</button>
              <button className="primary" disabled={!optimum} onClick={() => optimum && onApply(optimum)}>
                Appliquer ce réacteur
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
