import type { PowerParams } from '../power/power.types';

/** Point d'un profil poloïdal : [r, z] en mètres (r = distance à l'axe, z = hauteur). */
export type Point = [number, number];

export interface ReactorParams {
  /** Grand rayon R0 (m) */
  majorRadius: number;
  /** Petit rayon a (m) */
  minorRadius: number;
  /** Élongation κ */
  elongation: number;
  /** Triangularité δ */
  triangularity: number;
  /** Couche limite plasma-paroi (SOL) (m) */
  scrapeOffLayer: number;
  firstWallThickness: number;
  blanketThickness: number;
  shieldThickness: number;
  vesselThickness: number;
  /** Jeu entre l'enceinte à vide et les bobines toroïdales (m) */
  vesselCoilGap: number;
  tfCoilThickness: number;
  tfCoilCount: number;
}

/**
 * - revolve : profil fermé (avec trou éventuel) à faire tourner autour de l'axe vertical.
 * - coilArray : profil extrudé (largeur toroïdale `depth`) et répété `count` fois autour de l'axe.
 */
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
  /** Masse volumique moyenne estimée (kg/m³), null pour le plasma */
  density: number | null;
  color: string;
  opacity: number;
  geometry: ComponentGeometry;
  /** Direction de la vue éclatée : multiplicateurs vertical (toutes pièces) et radial (bobines TF) */
  explode: { vertical: number; radial: number };
  /** Volume de matière (m³) */
  volume: number;
  /** Masse estimée (tonnes), null pour le plasma */
  mass: number | null;
}

export interface ReactorModel {
  params: ReactorParams;
  summary: {
    aspectRatio: number;
    plasmaVolume: number;
    /** Surface de la première paroi (m²) */
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
  /** Hypothèses par défaut du bilan énergétique */
  power: PowerParams;
}
