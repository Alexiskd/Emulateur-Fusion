import { useState } from 'react';
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
  { id: 'geometry', label: 'Conception, CAO et neutronique' },
  { id: 'power', label: "Conversion d'énergie" },
  { id: 'systems', label: 'Codes systèmes intégrés' },
  { id: 'economics', label: 'Analyse technico-économique' },
  { id: 'equilibrium', label: 'Équilibre magnétique et stellarators' },
  { id: 'plasma', label: 'Simulation cinétique, turbulence et plasmas' },
  { id: 'diagnostics', label: 'Diagnostics, données et IA' },
  { id: 'materials', label: 'Interaction plasma-paroi et matériaux' },
  { id: 'catalogs', label: 'Listes et organisations' },
];

export function References({ references }: { references: OpenSourceReference[] }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? references.filter((r) =>
        [r.name, r.organization, r.description, r.relation ?? ''].some((text) => text.toLowerCase().includes(needle)),
      )
    : references;

  return (
    <>
      <input
        type="search"
        className="search"
        placeholder={`Rechercher parmi ${references.length} projets`}
        aria-label="Rechercher un projet"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length === 0 && <p className="muted">Aucun projet ne correspond.</p>}
      {CATEGORIES.map((cat) => {
        const items = matches.filter((r) => r.category === cat.id);
        if (items.length === 0) return null;
        return (
          <section key={cat.id}>
            <h2>
              {cat.label} · {items.length}
            </h2>
            <ul className="references">
              {items.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                  <span className="muted"> · {r.organization}</span>
                  <p>{r.description}</p>
                  {r.relation && <p className="muted">{r.relation}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
