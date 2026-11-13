// Miroir des types de l'API (apps/api/src/reactor/reactor.types.ts).
export type Point = [number, number];

export interface ReactorParams {
  majorRadius: number;
  minorRadius: number;
  elongation: number;
  triangularity: number;
  scrapeOffLayer: number;
  firstWallThickness: number;
  blanketThickness: number;
  shieldThickness: number;
  vesselThickness: number;
  vesselCoilGap: number;
  tfCoilThickness: number;
  tfCoilCount: number;
}

export type ComponentGeometry =
  | { kind: 'revolve'; outer: Point[]; inner?: Point[] }
  | { kind: 'coilArray'; outer: Point[]; inner: Point[]; depth: number; count: number };

export type ComponentGroup = 'plasma' | 'in-vessel' | 'vessel' | 'magnets' | 'cryostat';

export interface ReactorComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  role: string;
  material: string;
  density: number | null;
  color: string;
  opacity: number;
  geometry: ComponentGeometry;
  explode: { vertical: number; radial: number };
  volume: number;
  mass: number | null;
}

export interface ReactorModel {
  params: ReactorParams;
  summary: {
    aspectRatio: number;
    plasmaVolume: number;
    firstWallArea: number;
    totalMass: number;
    outerRadius: number;
    height: number;
  };
  components: ReactorComponent[];
}

export interface ReactorPreset {
  id: string;
  name: string;
  description: string;
  params: ReactorParams;
  power: PowerParams;
  scenario: ScenarioParams;
}

export interface OpenSourceReference {
  category: 'geometry' | 'power' | 'systems' | 'economics';
  name: string;
  organization: string;
  url: string;
  description: string;
  relation: string;
}

// Miroir de apps/api/src/power/power.types.ts — puissances en MW.
export interface PowerParams {
  fusionPower: number;
  auxHeatingPower: number;
  heatingEfficiency: number;
  blanketMultiplication: number;
  thermalEfficiency: number;
  cryoPower: number;
  magnetPower: number;
  pumpingFraction: number;
  otherFraction: number;
  firstWallArea?: number;
}

export interface PowerBalance {
  neutronPower: number;
  alphaPower: number;
  blanketPower: number;
  thermalPower: number;
  grossElectric: number;
  rejectedHeat: number;
  recirculating: { heating: number; cryo: number; magnets: number; pumping: number; other: number; total: number };
  netElectric: number;
  plasmaGain: number;
  engineeringGain: number;
  recirculatingFraction: number;
  plantEfficiency: number;
  neutronWallLoad: number | null;
}

// Miroir de apps/api/src/simulation/simulation.types.ts — durées en secondes.
export interface ScenarioParams {
  premagDuration: number;
  rampUpDuration: number;
  heatingDuration: number;
  flatTopDuration: number;
  rampDownDuration: number;
  dwellDuration: number;
}

export interface SimulationPhase {
  id: string;
  label: string;
  description: string;
  start: number;
  end: number;
  startIndex: number;
  endIndex: number;
}

export interface SimulationResult {
  phases: SimulationPhase[];
  samples: {
    time: number[];
    plasmaCurrent: number[];
    solenoidCurrent: number[];
    temperature: number[];
    auxPower: number[];
    fusionPower: number[];
    thermalPower: number[];
    grossElectric: number[];
    netElectric: number[];
    tritiumBurned: number[];
  };
  summary: {
    cycleDuration: number;
    flatTopFusionPower: number;
    peakTemperature: number;
    confinementTime: number;
    netEnergy: number;
    averageNetPower: number;
    dutyFactor: number;
    tritiumPerPulse: number;
  };
}

/** État instantané de la machine pendant la simulation, pour animer la vue 3D (valeurs de 0 à 1). */
export interface LiveState {
  plasmaCurrent: number;
  /** Courant du solénoïde, de −1 à 1 */
  solenoidCurrent: number;
  temperature: number;
  fusion: number;
}
