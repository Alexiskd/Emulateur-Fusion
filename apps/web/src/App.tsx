import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { ComponentTree } from './components/ComponentTree';
import { ComponentInfo, References } from './components/InfoPanel';
import { ParamPanel } from './components/ParamPanel';
import { PowerPanel } from './components/PowerPanel';
import { ReactorScene } from './components/ReactorScene';
import { formatDuration, SimulationPanel } from './components/SimulationPanel';
import type {
  LiveState,
  OpenSourceReference,
  PowerBalance,
  PowerParams,
  ReactorModel,
  ReactorParams,
  ReactorPreset,
  ScenarioParams,
  SimulationResult,
} from './types';

/** Échantillons lus par seconde à vitesse ×1 : un cycle complet dure environ 12 s. */
const SAMPLES_PER_SECOND = 40;

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
  const [tab, setTab] = useState<'parts' | 'power' | 'sim' | 'refs'>('parts');
  const [scenario, setScenario] = useState<ScenarioParams | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
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
        setScenario(list[0].scenario);
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

  // Simulation d'une impulsion : recalculée quand la machine, le bilan ou le scénario changent.
  const plasmaVolume = model?.summary.plasmaVolume;
  useEffect(() => {
    if (tab !== 'sim' || !powerParams || !scenario || !plasmaVolume) return;
    const controller = new AbortController();
    const { firstWallArea: _unused, ...power } = powerParams;
    const timer = setTimeout(() => {
      api
        .simulate({ power, plasmaVolume, scenario }, controller.signal)
        .then((result) => {
          setSimulation(result);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, powerParams, scenario, plasmaVolume]);

  // Lecture en boucle de la simulation.
  const sampleCount = simulation?.samples.time.length ?? 0;
  useEffect(() => {
    if (tab !== 'sim' || !playing || sampleCount < 2) return;
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      setFrame((f) => (f + elapsed * SAMPLES_PER_SECOND * speed) % (sampleCount - 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tab, playing, speed, sampleCount]);

  const frameIndex = Math.min(Math.floor(frame), Math.max(0, sampleCount - 1));
  const live = useMemo<LiveState | undefined>(() => {
    if (tab !== 'sim' || !simulation) return undefined;
    const s = simulation.samples;
    const peakFusion = Math.max(1e-9, ...s.fusionPower);
    return {
      plasmaCurrent: s.plasmaCurrent[frameIndex],
      solenoidCurrent: s.solenoidCurrent[frameIndex],
      temperature: s.temperature[frameIndex] / Math.max(1e-9, simulation.summary.peakTemperature),
      fusion: s.fusionPower[frameIndex] / peakFusion,
    };
  }, [tab, simulation, frameIndex]);
  const livePhase = live && simulation
    ? simulation.phases.find((p) => frameIndex < p.endIndex) ?? simulation.phases[simulation.phases.length - 1]
    : null;

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
              setScenario(p.scenario);
              setFrame(0);
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
            live={live}
          />
        )}

        {model && (
          <div className="stats">
            <span>Rapport d'aspect <b>{fmt.format(model.summary.aspectRatio)}</b></span>
            <span>Volume plasma <b>{fmt.format(model.summary.plasmaVolume)} m³</b></span>
            <span>Masse estimée <b>{fmt.format(model.summary.totalMass)} t</b></span>
            {balance && !livePhase && <span>Électricité nette <b>{fmt.format(balance.netElectric)} MW</b></span>}
            {livePhase && simulation && (
              <span className="live">
                ● {livePhase.label} · t = {formatDuration(simulation.samples.time[frameIndex])} · fusion{' '}
                <b>{fmt.format(simulation.samples.fusionPower[frameIndex])} MW</b> · net{' '}
                <b>{fmt.format(simulation.samples.netElectric[frameIndex])} MW</b>
              </span>
            )}
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
          <button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>Pièces</button>
          <button className={tab === 'power' ? 'active' : ''} onClick={() => setTab('power')}>Bilan</button>
          <button className={tab === 'sim' ? 'active' : ''} onClick={() => setTab('sim')}>Simulation</button>
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
          {tab === 'sim' && scenario && (
            <SimulationPanel
              result={simulation}
              index={frameIndex}
              playing={playing}
              speed={speed}
              scenario={scenario}
              onPlayToggle={() => setPlaying((p) => !p)}
              onSeek={(i) => {
                setPlaying(false);
                setFrame(i);
              }}
              onSpeed={setSpeed}
              onScenario={setScenario}
            />
          )}
          {tab === 'refs' && <References references={references} />}
        </div>
      </aside>
    </div>
  );
}
