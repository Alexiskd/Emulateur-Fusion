import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { ComponentTree } from './components/ComponentTree';
import { ComponentInfo, References } from './components/InfoPanel';
import { ParamPanel } from './components/ParamPanel';
import { PowerPanel } from './components/PowerPanel';
import { ReactorScene } from './components/ReactorScene';
import type {
  OpenSourceReference,
  PowerBalance,
  PowerParams,
  ReactorModel,
  ReactorParams,
  ReactorPreset,
} from './types';

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function App() {
  const [presets, setPresets] = useState<ReactorPreset[]>([]);
  const [references, setReferences] = useState<OpenSourceReference[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [params, setParams] = useState<ReactorParams | null>(null);
  const [model, setModel] = useState<ReactorModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [explode, setExplode] = useState(0);
  const [cutDegrees, setCutDegrees] = useState(90);
  const [tab, setTab] = useState<'parts' | 'power' | 'refs'>('parts');
  const [powerParams, setPowerParams] = useState<PowerParams | null>(null);
  const [balance, setBalance] = useState<PowerBalance | null>(null);

  useEffect(() => {
    api
      .presets()
      .then((list) => {
        setPresets(list);
        setActivePresetId(list[0].id);
        setParams(list[0].params);
        setPowerParams(list[0].power);
      })
      .catch(() => setError("API injoignable : lancez l'API NestJS (npm run dev)."));
    api.references().then(setReferences).catch(() => undefined);
  }, []);

  // Reconstruit le modèle côté API à chaque changement de paramètres (avec un léger délai).
  useEffect(() => {
    if (!params) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .build(params, controller.signal)
        .then((m) => {
          setModel(m);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params]);

  // Bilan énergétique : recalculé quand les hypothèses ou la surface de paroi changent.
  const firstWallArea = model?.summary.firstWallArea;
  useEffect(() => {
    if (!powerParams) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .powerBalance({ ...powerParams, firstWallArea }, controller.signal)
        .then(setBalance)
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [powerParams, firstWallArea]);

  const selected = useMemo(
    () => model?.components.find((c) => c.id === selectedId) ?? null,
    [model, selectedId],
  );

  const toggle = (ids: string[], visible: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (visible ? next.delete(id) : next.add(id)));
      return next;
    });

  const exportJson = () => {
    if (!model) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reacteur-fusion.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="layout">
      <aside className="panel">
        <header>
          <h1>Émulateur fusion</h1>
          <p className="muted">Modèle paramétrique d'un tokamak</p>
        </header>
        {params && (
          <ParamPanel
            presets={presets}
            activePresetId={activePresetId}
            params={params}
            onPreset={(p) => {
              setActivePresetId(p.id);
              setParams(p.params);
              setPowerParams(p.power);
            }}
            onChange={(p) => {
              setActivePresetId(null);
              setParams(p);
            }}
          />
        )}
      </aside>

      <main className="viewport">
        {model && (
          <ReactorScene
            model={model}
            hidden={hidden}
            selectedId={selectedId}
            onSelect={setSelectedId}
            explode={explode}
            cutDegrees={cutDegrees}
          />
        )}

        {model && (
          <div className="stats">
            <span>Rapport d'aspect <b>{fmt.format(model.summary.aspectRatio)}</b></span>
            <span>Volume plasma <b>{fmt.format(model.summary.plasmaVolume)} m³</b></span>
            <span>Masse estimée <b>{fmt.format(model.summary.totalMass)} t</b></span>
            {balance && <span>Électricité nette <b>{fmt.format(balance.netElectric)} MW</b></span>}
            <span>Encombrement <b>⌀ {fmt.format(model.summary.outerRadius * 2)} × {fmt.format(model.summary.height)} m</b></span>
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <div className="view-controls">
          <label>
            Vue éclatée
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
          </label>
          <label>
            Coupe {cutDegrees}°
            <input type="range" min={0} max={270} step={5} value={cutDegrees} onChange={(e) => setCutDegrees(Number(e.target.value))} />
          </label>
          <button onClick={exportJson} disabled={!model}>Exporter JSON</button>
        </div>
      </main>

      <aside className="panel">
        <nav className="tabs">
          <button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>Décomposition</button>
          <button className={tab === 'power' ? 'active' : ''} onClick={() => setTab('power')}>Bilan énergétique</button>
          <button className={tab === 'refs' ? 'active' : ''} onClick={() => setTab('refs')}>Références</button>
        </nav>
        <div className="panel-body">
          {tab === 'parts' && model && (
            <>
              <ComponentTree
                components={model.components}
                hidden={hidden}
                selectedId={selectedId}
                onToggle={toggle}
                onSelect={setSelectedId}
              />
              <ComponentInfo component={selected} />
            </>
          )}
          {tab === 'power' && powerParams && (
            <PowerPanel params={powerParams} balance={balance} onChange={setPowerParams} />
          )}
          {tab === 'refs' && <References references={references} />}
        </div>
      </aside>
    </div>
  );
}
