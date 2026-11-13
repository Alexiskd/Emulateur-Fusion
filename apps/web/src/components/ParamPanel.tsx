import type { ReactorParams, ReactorPreset } from '../types';

interface Field {
  key: keyof ReactorParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Plasma',
    fields: [
      { key: 'majorRadius', label: 'Grand rayon R₀', min: 0.5, max: 15, step: 0.05, unit: 'm' },
      { key: 'minorRadius', label: 'Petit rayon a', min: 0.1, max: 6, step: 0.01, unit: 'm' },
      { key: 'elongation', label: 'Élongation κ', min: 1, max: 3, step: 0.01, unit: '' },
      { key: 'triangularity', label: 'Triangularité δ', min: 0, max: 0.7, step: 0.01, unit: '' },
    ],
  },
  {
    title: 'Empilement radial',
    fields: [
      { key: 'scrapeOffLayer', label: 'Jeu plasma-paroi', min: 0.01, max: 0.5, step: 0.01, unit: 'm' },
      { key: 'firstWallThickness', label: 'Première paroi', min: 0.005, max: 0.3, step: 0.005, unit: 'm' },
      { key: 'blanketThickness', label: 'Couverture', min: 0.02, max: 2, step: 0.01, unit: 'm' },
      { key: 'shieldThickness', label: 'Blindage', min: 0.02, max: 1.5, step: 0.01, unit: 'm' },
      { key: 'vesselThickness', label: 'Enceinte à vide', min: 0.02, max: 1.5, step: 0.01, unit: 'm' },
      { key: 'vesselCoilGap', label: 'Jeu enceinte-bobines', min: 0.01, max: 1, step: 0.01, unit: 'm' },
    ],
  },
  {
    title: 'Bobines toroïdales',
    fields: [
      { key: 'tfCoilThickness', label: 'Épaisseur', min: 0.05, max: 3, step: 0.01, unit: 'm' },
      { key: 'tfCoilCount', label: 'Nombre', min: 6, max: 32, step: 1, unit: '' },
    ],
  },
];

interface Props {
  presets: ReactorPreset[];
  activePresetId: string | null;
  params: ReactorParams;
  onPreset: (preset: ReactorPreset) => void;
  onChange: (params: ReactorParams) => void;
}

export function ParamPanel({ presets, activePresetId, params, onPreset, onChange }: Props) {
  return (
    <div className="panel-body">
      <h2>Machine type</h2>
      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.id}
            className={p.id === activePresetId ? 'preset active' : 'preset'}
            title={p.description}
            onClick={() => onPreset(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.fields.map((f) => (
            <label key={f.key} className="slider">
              <span className="slider-head">
                <span>{f.label}</span>
                <output>
                  {params[f.key]} {f.unit}
                </output>
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
        </section>
      ))}
    </div>
  );
}
