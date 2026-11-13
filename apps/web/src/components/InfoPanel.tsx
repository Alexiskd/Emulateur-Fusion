import type { OpenSourceReference, ReactorComponent } from '../types';

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function ComponentInfo({ component }: { component: ReactorComponent | null }) {
  if (!component) {
    return <p className="muted">Cliquez sur une pièce, dans la vue 3D ou dans la liste, pour voir son rôle.</p>;
  }
  return (
    <div className="info">
      <h3>
        <span className="swatch" style={{ background: component.color }} />
        {component.name}
      </h3>
      <p>{component.role}</p>
      <dl>
        <dt>Matériau</dt>
        <dd>{component.material}</dd>
        <dt>Volume</dt>
        <dd>{fmt.format(component.volume)} m³</dd>
        {component.mass !== null && (
          <>
            <dt>Masse estimée</dt>
            <dd>{fmt.format(component.mass)} t</dd>
          </>
        )}
      </dl>
    </div>
  );
}

const CATEGORIES: { id: OpenSourceReference['category']; label: string }[] = [
  { id: 'geometry', label: 'Modélisation 3D' },
  { id: 'power', label: "Conversion d'énergie" },
  { id: 'systems', label: 'Codes systèmes intégrés' },
  { id: 'economics', label: 'Analyse technico-économique' },
];

export function References({ references }: { references: OpenSourceReference[] }) {
  return (
    <>
      {CATEGORIES.map((cat) => (
        <section key={cat.id}>
          <h2>{cat.label}</h2>
          <ul className="references">
            {references
              .filter((r) => r.category === cat.id)
              .map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                  <span className="muted"> · {r.organization}</span>
                  <p>{r.description}</p>
                  <p className="muted">{r.relation}</p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
