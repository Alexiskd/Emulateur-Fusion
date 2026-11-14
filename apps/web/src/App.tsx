import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { ComponentTree } from './components/ComponentTree';
import { EnergyDiagram } from './components/EnergyDiagram';
import { ComponentInfo, References } from './components/InfoPanel';
import { OptimizerOverlay, type PlantOptions } from './components/OptimizerOverlay';
import { ParamPanel } from './components/ParamPanel';
import { PowerPanel } from './components/PowerPanel';
import { ReactorScene } from './components/ReactorScene';
import { formatDuration, SimulationPanel } from './components/SimulationPanel';
import { TransferPanel } from './components/TransferPanel';
import type {
  Coolant,
  LiveState,
  MagnetTechnology,
  PlantEvaluation,
  PlantOptimization,
  OptimizationResult,
  OpenSourceReference,
  PowerBalance,
  PowerParams,
  ReactorModel,
  ReactorParams,
  ReactorPreset,
  ScenarioParams,
  SimulationResult,
  TransferDesign,
  TransferResult,
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
  const [tab, setTab] = useState<'parts' | 'power' | 'sim' | 'transfer' | 'refs'>('parts');
  const [coolants, setCoolants] = useState<Coolant[]>([]);
  const [transferDesign, setTransferDesign] = useState<TransferDesign | null>(null);
  const [transfer, setTransfer] = useState<TransferResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [magnets, setMagnets] = useState<MagnetTechnology[]>([]);
  const [plantOpen, setPlantOpen] = useState(false);
  const [plantOptions, setPlantOptions] = useState<PlantOptions>({
    objective: 'efficiency',
    operation: 'pulsed',
    magnet: 'lts',
    maxMajorRadius: 10,
  });
  const [plantResult, setPlantResult] = useState<PlantOptimization | null>(null);
  const [plantLoading, setPlantLoading] = useState(false);
  const [plantError, setPlantError] = useState<string | null>(null);
  // Point de fonctionnement du plasma calculé par l'optimiseur, repris par la simulation.
  const [nominalPlasma, setNominalPlasma] = useState<{ temperature: number; density: number } | undefined>();
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
        setTransferDesign(list[0].transfer);
        setPlantOptions((o) => ({ ...o, magnet: list[0].magnet }));
      })
      .catch(() => setError("API injoignable : lancez l'API NestJS (npm run dev)."));
    api.references().then(setReferences).catch(() => undefined);
    api.coolants().then(setCoolants).catch(() => undefined);
    api.magnets().then(setMagnets).catch(() => undefined);
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

  // Chaîne de transfert d'énergie : recalculée quand le bilan ou le réglage changent.
  const transferPower = useMemo(() => {
    if (!powerParams) return null;
    const { firstWallArea: _unused, ...power } = powerParams;
    return power;
  }, [powerParams]);
  useEffect(() => {
    if (tab !== 'transfer' || !transferPower || !transferDesign) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .transfer({ power: transferPower, design: transferDesign }, controller.signal)
        .then((result) => {
          setTransfer(result);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, transferPower, transferDesign]);

  // Un optimum calculé pour d'autres puissances ou un autre site n'est plus valable.
  const ambientTemperature = transferDesign?.ambientTemperature;
  useEffect(() => setOptimization(null), [transferPower, ambientTemperature]);

  const optimize = () => {
    if (!transferPower || !transferDesign) return;
    setOptimizing(true);
    api
      .optimizeTransfer({ power: transferPower, design: transferDesign })
      .then((result) => {
        setOptimization(result);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setOptimizing(false));
  };

  // Optimisation globale : géométrie, plasma et chaîne de conversion d'un seul tenant.
  const runPlantOptimization = (options: PlantOptions = plantOptions) => {
    if (!params || !transferPower || !transferDesign) return;
    setPlantLoading(true);
    setPlantError(null);
    api
      .optimizePlant({ params, power: transferPower, design: transferDesign, ...options })
      .then(setPlantResult)
      .catch((e: Error) => setPlantError(e.message))
      .finally(() => setPlantLoading(false));
  };

  const openPlantOptimizer = () => {
    setPlantOpen(true);
    setPlantResult(null);
    runPlantOptimization();
  };

  const applyPlant = (optimum: PlantEvaluation) => {
    setActivePresetId(null);
    setParams(optimum.params);
    setPowerParams(optimum.power);
    setTransferDesign(optimum.transfer.design);
    setNominalPlasma({ temperature: optimum.plasma.temperature, density: optimum.plasma.density });
    // La simulation suit le mode retenu ; en continu, on montre un plateau de 8 h.
    setScenario((s) =>
      s && {
        ...s,
        mode: optimum.operation,
        flatTopDuration: optimum.operation === 'steady' ? Math.max(s.flatTopDuration, 28800) : s.flatTopDuration,
      },
    );
    setPlantOpen(false);
  };

  const reportTransfer = () => {
    if (!transfer || !powerParams) return;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    setPowerParams({
      ...powerParams,
      thermalEfficiency: clamp(transfer.equivalent.thermalEfficiency, 0.1, 0.7),
      pumpingFraction: clamp(transfer.equivalent.pumpingFraction, 0, 0.2),
    });
    setTab('power');
  };

  // Simulation d'une impulsion : recalculée quand la machine, le bilan ou le scénario changent.
  const plasmaVolume = model?.summary.plasmaVolume;
  useEffect(() => {
    if (tab !== 'sim' || !powerParams || !scenario || !plasmaVolume) return;
    const controller = new AbortController();
    const { firstWallArea: _ignored, ...power } = powerParams;
    const timer = setTimeout(() => {
      api
        .simulate({ power, plasmaVolume, scenario, nominal: nominalPlasma }, controller.signal)
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
  }, [tab, powerParams, scenario, plasmaVolume, nominalPlasma]);

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
          <button className="primary optimize" onClick={openPlantOptimizer} disabled={!params || !transferDesign}>
            Optimiser le réacteur
          </button>
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
              setTransferDesign(p.transfer);
              setPlantOptions((o) => ({ ...o, magnet: p.magnet }));
              setNominalPlasma(undefined);
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
        {tab === 'transfer' && transfer && (
          <div className="diagram-wrap">
            <EnergyDiagram result={transfer} />
          </div>
        )}
        {tab !== 'transfer' && model && (
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

        {model && tab !== 'transfer' && (
          <div className="stats">
            <span>Rapport d'aspect <b>{fmt.format(model.summary.aspectRatio)}</b></span>
            <span>Volume plasma <b>{fmt.format(model.summary.plasmaVolume)} m³</b></span>
            <span>Masse estimée <b>{fmt.format(model.summary.totalMass)} t</b></span>
            {balance && !livePhase && <span>Électricité nette <b>{fmt.format(balance.netElectric)} MW</b></span>}
            <span>Encombrement <b>⌀ {fmt.format(model.summary.outerRadius * 2)} × {fmt.format(model.summary.height)} m</b></span>
            {livePhase && simulation && (
              <span className="live">
                ● {livePhase.label} · t = {formatDuration(simulation.samples.time[frameIndex])} · fusion{' '}
                <b>{fmt.format(simulation.samples.fusionPower[frameIndex])} MW</b> · net{' '}
                <b>{fmt.format(simulation.samples.netElectric[frameIndex])} MW</b>
              </span>
            )}
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        {plantOpen && (
          <OptimizerOverlay
            options={plantOptions}
            magnets={magnets}
            result={plantResult}
            loading={plantLoading}
            error={plantError}
            onOptions={setPlantOptions}
            onRun={() => runPlantOptimization()}
            onApply={applyPlant}
            onClose={() => setPlantOpen(false)}
          />
        )}

        {tab === 'transfer' && transfer && (
          <div className="stats">
            <span>Fusion <b>{fmt.format(transferPower?.fusionPower ?? 0)} MW</b></span>
            <span>Chaleur utile <b>{fmt.format(transfer.heat.primary + transfer.heat.divertor)} MW</b></span>
            <span>Électricité brute <b>{fmt.format(transfer.electric.gross)} MW</b></span>
            <span>Électricité nette <b>{fmt.format(transfer.electric.net)} MW</b></span>
          </div>
        )}

        <div className="view-controls" hidden={tab === 'transfer'}>
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
          <button className={tab === 'transfer' ? 'active' : ''} onClick={() => setTab('transfer')}>Transfert</button>
          <button className={tab === 'refs' ? 'active' : ''} onClick={() => setTab('refs')}>Réf.</button>
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
          {tab === 'transfer' && transferDesign && (
            <TransferPanel
              design={transferDesign}
              result={transfer}
              coolants={coolants}
              optimization={optimization}
              optimizing={optimizing}
              onDesign={setTransferDesign}
              onOptimize={optimize}
              onReport={reportTransfer}
            />
          )}
          {tab === 'refs' && <References references={references} />}
        </div>
      </aside>
    </div>
  );
}
