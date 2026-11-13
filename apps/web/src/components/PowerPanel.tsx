import type { PowerBalance, PowerParams } from '../types';

interface Field {
  key: Exclude<keyof PowerParams, 'firstWallArea'>;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 'MW', '%' (valeur stockée entre 0 et 1) ou '' */
  unit: 'MW' | '%' | '';
}

const FIELDS: Field[] = [
  { key: 'fusionPower', label: 'Puissance de fusion', min: 10, max: 5000, step: 10, unit: 'MW' },
  { key: 'auxHeatingPower', label: 'Chauffage injecté', min: 1, max: 300, step: 1, unit: 'MW' },
  { key: 'heatingEfficiency', label: 'Rendement du chauffage', min: 0.1, max: 0.9, step: 0.01, unit: '%' },
  { key: 'blanketMultiplication', label: 'Multiplication couverture', min: 1, max: 1.5, step: 0.01, unit: '' },
  { key: 'thermalEfficiency', label: 'Rendement du cycle', min: 0.2, max: 0.6, step: 0.01, unit: '%' },
  { key: 'cryoPower', label: 'Cryogénie', min: 0, max: 150, step: 1, unit: 'MW' },
  { key: 'magnetPower', label: 'Aimants', min: 0, max: 200, step: 1, unit: 'MW' },
  { key: 'pumpingFraction', label: 'Pompage (part du thermique)', min: 0, max: 0.15, step: 0.005, unit: '%' },
  { key: 'otherFraction', label: 'Autres auxiliaires (part du brut)', min: 0, max: 0.15, step: 0.005, unit: '%' },
];

const mw = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

function display(value: number, unit: Field['unit']): string {
  if (unit === '%') return pct.format(value);
  return unit ? `${dec.format(value)} ${unit}` : dec.format(value);
}

interface Row {
  label: string;
  value: number;
  color: string;
  indent?: boolean;
}

function Flow({ title, rows, scale }: { title: string; rows: Row[]; scale: number }) {
  return (
    <div className="flow">
      <h2>{title}</h2>
      {rows.map((row) => (
        <div key={row.label} className={row.indent ? 'flow-row indent' : 'flow-row'}>
          <span>{row.label}</span>
          <span className="flow-value">{mw.format(row.value)} MW</span>
          <span className="flow-bar">
            <span style={{ width: `${Math.min(100, (Math.abs(row.value) / scale) * 100)}%`, background: row.color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  params: PowerParams;
  balance: PowerBalance | null;
  onChange: (params: PowerParams) => void;
}

export function PowerPanel({ params, balance, onChange }: Props) {
  return (
    <>
      {balance && (
        <>
          <div className={balance.netElectric >= 0 ? 'net positive' : 'net negative'}>
            <span>Électricité nette</span>
            <b>{mw.format(balance.netElectric)} MW</b>
            <span className="muted">
              {balance.netElectric >= 0
                ? `${pct.format(balance.plantEfficiency)} de la puissance de fusion`
                : 'La machine consomme plus qu’elle ne produit'}
            </span>
          </div>

          <Flow
            title="De la fusion à la chaleur"
            scale={balance.thermalPower}
            rows={[
              { label: 'Neutrons (14,1 MeV)', value: balance.neutronPower, color: '#4f8fd9' },
              { label: 'Dépôt dans la couverture', value: balance.blanketPower, color: '#e8833a', indent: true },
              { label: 'Particules alpha', value: balance.alphaPower, color: '#ff4fd8' },
              { label: 'Chauffage injecté', value: params.auxHeatingPower, color: '#e6c84a' },
              { label: 'Puissance thermique', value: balance.thermalPower, color: '#d94f4f' },
            ]}
          />
          <Flow
            title="De la chaleur à l'électricité"
            scale={balance.thermalPower}
            rows={[
              { label: 'Électricité brute', value: balance.grossElectric, color: '#3fbf7f' },
              { label: 'Chaleur rejetée', value: balance.rejectedHeat, color: '#7a7f8c' },
            ]}
          />
          <Flow
            title="Consommation des auxiliaires"
            scale={balance.grossElectric}
            rows={[
              { label: 'Chauffage du plasma', value: balance.recirculating.heating, color: '#e6c84a' },
              { label: 'Pompage du caloporteur', value: balance.recirculating.pumping, color: '#4f8fd9' },
              { label: 'Cryogénie', value: balance.recirculating.cryo, color: '#88aacc' },
              { label: 'Aimants', value: balance.recirculating.magnets, color: '#d94f4f' },
              { label: 'Autres', value: balance.recirculating.other, color: '#7a7f8c' },
              { label: 'Total recirculé', value: balance.recirculating.total, color: '#c9ced6' },
            ]}
          />

          <dl className="indicators">
            <dt>Gain du plasma Q</dt>
            <dd>{dec.format(balance.plasmaGain)}</dd>
            <dt>Gain d'ingénierie</dt>
            <dd>{dec.format(balance.engineeringGain)}</dd>
            <dt>Part recirculée</dt>
            <dd>{pct.format(balance.recirculatingFraction)}</dd>
            {balance.neutronWallLoad !== null && (
              <>
                <dt>Charge neutronique paroi</dt>
                <dd>{dec.format(balance.neutronWallLoad)} MW/m²</dd>
              </>
            )}
          </dl>
        </>
      )}

      <h2>Hypothèses</h2>
      {FIELDS.map((f) => (
        <label key={f.key} className="slider">
          <span className="slider-head">
            <span>{f.label}</span>
            <output>{display(params[f.key], f.unit)}</output>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={params[f.key]}
            onChange={(e) => onChange({ ...params, [f.key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </>
  );
}
