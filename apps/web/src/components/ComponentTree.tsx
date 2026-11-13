import type { ComponentGroup, ReactorComponent } from '../types';

const GROUPS: { id: ComponentGroup; label: string }[] = [
  { id: 'plasma', label: 'Plasma' },
  { id: 'in-vessel', label: 'Composants internes' },
  { id: 'vessel', label: 'Enceinte et blindage' },
  { id: 'magnets', label: 'Système magnétique' },
  { id: 'cryostat', label: 'Cryostat' },
];

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

interface Props {
  components: ReactorComponent[];
  hidden: Set<string>;
  selectedId: string | null;
  onToggle: (ids: string[], visible: boolean) => void;
  onSelect: (id: string) => void;
}

export function ComponentTree({ components, hidden, selectedId, onToggle, onSelect }: Props) {
  return (
    <div className="tree">
      {GROUPS.map((group) => {
        const items = components.filter((c) => c.group === group.id);
        if (items.length === 0) return null;
        const ids = items.map((c) => c.id);
        const allVisible = ids.every((id) => !hidden.has(id));
        const mass = items.reduce((sum, c) => sum + (c.mass ?? 0), 0);
        return (
          <div key={group.id} className="tree-group">
            <label className="tree-group-head">
              <input type="checkbox" checked={allVisible} onChange={() => onToggle(ids, !allVisible)} />
              <span>{group.label}</span>
              {mass > 0 && <span className="muted">{fmt.format(mass)} t</span>}
            </label>
            {items.map((c) => (
              <div key={c.id} className={c.id === selectedId ? 'tree-item selected' : 'tree-item'}>
                <input
                  type="checkbox"
                  aria-label={`Afficher ${c.name}`}
                  checked={!hidden.has(c.id)}
                  onChange={() => onToggle([c.id], hidden.has(c.id))}
                />
                <button onClick={() => onSelect(c.id)}>
                  <span className="swatch" style={{ background: c.color }} />
                  {c.name}
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
