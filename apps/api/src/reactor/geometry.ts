import {
  ComponentGeometry,
  Point,
  ReactorComponent,
  ReactorModel,
  ReactorParams,
} from './reactor.types';

/**
 * Modèle paramétrique simplifié d'un tokamak, dans l'esprit de Paramak / Bluemira :
 * une frontière plasma en « D » (paramétrisation de Miller), puis un empilement radial
 * de couches obtenues par décalage normal de cette frontière.
 */

const TAU = Math.PI * 2;
/** Demi-ouverture poloïdale du divertor, centrée sur le bas de la machine. */
const DIVERTOR_HALF_ANGLE = (28 * Math.PI) / 180;
const BOTTOM = (3 * Math.PI) / 2;

export class RadialBuildError extends Error {}

/** Point de la frontière plasma décalé de `d` mètres le long de la normale extérieure. */
export function offsetPoint(p: ReactorParams, theta: number, d: number): Point {
  const { majorRadius: R0, minorRadius: a, elongation: k, triangularity: delta } = p;
  const phase = theta + delta * Math.sin(theta);
  const r = R0 + a * Math.cos(phase);
  const z = k * a * Math.sin(theta);
  if (d === 0) return [r, z];
  const dr = -a * Math.sin(phase) * (1 + delta * Math.cos(theta));
  const dz = k * a * Math.cos(theta);
  const norm = Math.hypot(dr, dz) || 1;
  return [r + (d * dz) / norm, z - (d * dr) / norm];
}

/** Contour fermé complet (sens trigonométrique), sans répétition du premier point. */
export function loop(p: ReactorParams, d: number, n = 96): Point[] {
  return Array.from({ length: n }, (_, i) => offsetPoint(p, (i / n) * TAU, d));
}

/** Bande entre deux décalages, limitée à un secteur poloïdal [t0, t1]. */
export function band(p: ReactorParams, dIn: number, dOut: number, t0: number, t1: number, n = 72): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) pts.push(offsetPoint(p, t0 + ((t1 - t0) * i) / n, dIn));
  for (let i = n; i >= 0; i--) pts.push(offsetPoint(p, t0 + ((t1 - t0) * i) / n, dOut));
  return pts;
}

export function rect(rMin: number, rMax: number, zMin: number, zMax: number): Point[] {
  return [
    [rMin, zMin],
    [rMax, zMin],
    [rMax, zMax],
    [rMin, zMax],
  ];
}

/** Aire (m²) et rayon du centroïde (m) d'un polygone simple. */
export function areaAndCentroidR(poly: Point[]): { area: number; rc: number } {
  let a2 = 0;
  let cr = 0;
  for (let i = 0; i < poly.length; i++) {
    const [r0, z0] = poly[i];
    const [r1, z1] = poly[(i + 1) % poly.length];
    const cross = r0 * z1 - r1 * z0;
    a2 += cross;
    cr += (r0 + r1) * cross;
  }
  const area = a2 / 2;
  return { area: Math.abs(area), rc: area === 0 ? 0 : cr / (6 * area) };
}

/** Volume de révolution complet par le théorème de Pappus-Guldin. */
export function revolveVolume(outer: Point[], inner?: Point[]): number {
  const o = areaAndCentroidR(outer);
  const i = inner ? areaAndCentroidR(inner) : { area: 0, rc: 0 };
  return TAU * (o.area * o.rc - i.area * i.rc);
}

/** Aire (m²) de la surface de révolution engendrée par un contour fermé. */
export function revolveSurfaceArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [r0, z0] = poly[i];
    const [r1, z1] = poly[(i + 1) % poly.length];
    area += Math.PI * (r0 + r1) * Math.hypot(r1 - r0, z1 - z0);
  }
  return area;
}

function geometryVolume(g: ComponentGeometry): number {
  if (g.kind === 'revolve') return revolveVolume(g.outer, g.inner);
  const section = areaAndCentroidR(g.outer).area - areaAndCentroidR(g.inner).area;
  return section * g.depth * g.count;
}

type ComponentSpec = Omit<ReactorComponent, 'volume' | 'mass'>;

function finalize(spec: ComponentSpec): ReactorComponent {
  const volume = geometryVolume(spec.geometry);
  return {
    ...spec,
    volume,
    mass: spec.density === null ? null : (volume * spec.density) / 1000,
  };
}

export function buildReactor(p: ReactorParams): ReactorModel {
  const a = p.minorRadius;

  // Empilement radial : décalages cumulés depuis la frontière plasma.
  const dSol = p.scrapeOffLayer;
  const dFw = dSol + p.firstWallThickness;
  const dBlanket = dFw + p.blanketThickness;
  const dShield = dBlanket + p.shieldThickness;
  const dVessel = dShield + p.vesselThickness;
  const dTfIn = dVessel + p.vesselCoilGap;
  const dTfOut = dTfIn + p.tfCoilThickness;

  // Côté intérieur, tout doit tenir entre le plasma et l'axe de la machine.
  const tfInnerEdge = p.majorRadius - a - dTfOut;
  const csOuter = tfInnerEdge - Math.max(0.03, 0.04 * a);
  if (csOuter < 0.25) {
    const missing = (0.25 - csOuter).toFixed(2);
    throw new RadialBuildError(
      `L'empilement radial ne tient pas côté intérieur : il manque ${missing} m. ` +
        `Augmentez le grand rayon ou réduisez le petit rayon / les épaisseurs.`,
    );
  }
  const csInner = Math.max(0.12, csOuter * 0.62);

  const arcStart = -Math.PI / 2 + DIVERTOR_HALF_ANGLE;
  const arcEnd = BOTTOM - DIVERTOR_HALF_ANGLE;

  const specs: ComponentSpec[] = [
    {
      id: 'plasma',
      name: 'Plasma',
      group: 'plasma',
      role: 'Mélange deutérium-tritium ionisé à ~150 millions de °C, confiné par les champs magnétiques ; siège des réactions de fusion.',
      material: 'Plasma D-T',
      density: null,
      color: '#ff4fd8',
      opacity: 0.55,
      geometry: { kind: 'revolve', outer: loop(p, 0) },
      explode: { vertical: 0, radial: 0 },
    },
    {
      id: 'first-wall',
      name: 'Première paroi',
      group: 'in-vessel',
      role: 'Surface directement exposée au plasma ; encaisse le flux de chaleur et de particules.',
      material: 'Tungstène / béryllium sur structure refroidie',
      density: 12000,
      color: '#c9ced6',
      opacity: 1,
      geometry: { kind: 'revolve', outer: band(p, dSol, dFw, arcStart, arcEnd) },
      explode: { vertical: 1, radial: 0 },
    },
    {
      id: 'blanket',
      name: 'Couverture tritigène',
      group: 'in-vessel',
      role: 'Ralentit les neutrons de 14 MeV, récupère leur énergie sous forme de chaleur et régénère le tritium à partir du lithium.',
      material: 'Céramique ou alliage au lithium, multiplicateur de neutrons, acier Eurofer',
      density: 4500,
      color: '#e8833a',
      opacity: 1,
      geometry: { kind: 'revolve', outer: band(p, dFw, dBlanket, arcStart, arcEnd) },
      explode: { vertical: 2, radial: 0 },
    },
    {
      id: 'divertor',
      name: 'Divertor',
      group: 'in-vessel',
      role: 'Évacue les cendres d\'hélium et les impuretés ; reçoit les flux de chaleur les plus intenses de la machine.',
      material: 'Tungstène sur puits de chaleur CuCrZr',
      density: 13000,
      color: '#7a7f8c',
      opacity: 1,
      geometry: {
        kind: 'revolve',
        outer: band(p, dSol, dBlanket, BOTTOM - DIVERTOR_HALF_ANGLE, BOTTOM + DIVERTOR_HALF_ANGLE, 24),
      },
      explode: { vertical: -1.5, radial: 0 },
    },
    {
      id: 'shield',
      name: 'Blindage neutronique',
      group: 'vessel',
      role: 'Atténue les neutrons et les gammas pour protéger l\'enceinte à vide et les aimants supraconducteurs.',
      material: 'Acier boré et eau',
      density: 6000,
      color: '#4f8fd9',
      opacity: 1,
      geometry: { kind: 'revolve', outer: loop(p, dShield), inner: loop(p, dBlanket) },
      explode: { vertical: 3, radial: 0 },
    },
    {
      id: 'vacuum-vessel',
      name: 'Enceinte à vide',
      group: 'vessel',
      role: 'Chambre étanche qui maintient l\'ultravide nécessaire au plasma ; première barrière de confinement.',
      material: 'Acier inoxydable 316L(N), double paroi',
      density: 7930,
      color: '#9aa7b5',
      opacity: 1,
      geometry: { kind: 'revolve', outer: loop(p, dVessel), inner: loop(p, dShield) },
      explode: { vertical: 4, radial: 0 },
    },
  ];

  // Bobines de champ toroïdal : la largeur est limitée pour ne pas se chevaucher côté intérieur.
  const tfDepth = Math.min(p.tfCoilThickness, 2 * Math.tan(Math.PI / p.tfCoilCount) * tfInnerEdge * 0.98);
  specs.push({
    id: 'tf-coils',
    name: `Bobines toroïdales (×${p.tfCoilCount})`,
    group: 'magnets',
    role: 'Créent le champ magnétique toroïdal principal qui confine le plasma.',
    material: 'Supraconducteur Nb3Sn en boîtier acier',
    density: 7500,
    color: '#d94f4f',
    opacity: 1,
    geometry: {
      kind: 'coilArray',
      outer: loop(p, dTfOut),
      inner: loop(p, dTfIn),
      depth: tfDepth,
      count: p.tfCoilCount,
    },
    explode: { vertical: 0, radial: 1 },
  });

  // Solénoïde central : cylindre creux au centre de la machine.
  const csHalfHeight = offsetPoint(p, Math.PI / 2, dTfIn)[1] * 0.92;
  specs.push({
    id: 'central-solenoid',
    name: 'Solénoïde central',
    group: 'magnets',
    role: 'Induit le courant dans le plasma par variation de flux, comme le primaire d\'un transformateur.',
    material: 'Supraconducteur Nb3Sn',
    density: 7500,
    color: '#e6c84a',
    opacity: 1,
    geometry: { kind: 'revolve', outer: rect(csInner, csOuter, -csHalfHeight, csHalfHeight) },
    explode: { vertical: -4.5, radial: 0 },
  });

  // Bobines de champ poloïdal : anneaux horizontaux à l'extérieur des bobines toroïdales.
  const pfSize = 0.4 * a;
  const dPf = dTfOut + 0.15 * a + pfSize / 2;
  const pfAngles = [38, 72, 105, -105, -72, -38];
  let maxR = 0;
  let maxZ = 0;
  pfAngles.forEach((deg, i) => {
    const [cr, cz] = offsetPoint(p, (deg * Math.PI) / 180, dPf);
    const size = Math.abs(deg) === 72 ? pfSize * 0.8 : pfSize;
    const r = Math.max(cr, csOuter + 0.1 + size / 2);
    maxR = Math.max(maxR, r + size / 2);
    maxZ = Math.max(maxZ, Math.abs(cz) + size / 2);
    specs.push({
      id: `pf-coil-${i + 1}`,
      name: `Bobine poloïdale PF${i + 1}`,
      group: 'magnets',
      role: 'Contrôle la forme, la position et la stabilité verticale du plasma.',
      material: 'Supraconducteur NbTi',
      density: 7000,
      color: '#3fbf7f',
      opacity: 1,
      geometry: { kind: 'revolve', outer: rect(r - size / 2, r + size / 2, cz - size / 2, cz + size / 2) },
      explode: { vertical: cz > 0 ? 5.5 : -3, radial: 0 },
    });
  });

  // Cryostat : cuve cylindrique fermée qui enveloppe l'ensemble.
  const wall = Math.max(0.05, 0.04 * a);
  const cryoR = maxR + 0.6 * a;
  const cryoH = Math.max(maxZ, offsetPoint(p, Math.PI / 2, dTfOut)[1]) + 0.6 * a;
  specs.push({
    id: 'cryostat',
    name: 'Cryostat',
    group: 'cryostat',
    role: 'Enceinte sous vide qui isole thermiquement les aimants supraconducteurs refroidis à 4 K.',
    material: 'Acier inoxydable 304L',
    density: 7930,
    color: '#88aacc',
    opacity: 0.18,
    geometry: {
      kind: 'revolve',
      outer: rect(0, cryoR, -cryoH, cryoH),
      inner: rect(0, cryoR - wall, -cryoH + wall, cryoH - wall),
    },
    explode: { vertical: 7.5, radial: 0 },
  });

  const components = specs.map(finalize);
  return {
    params: p,
    summary: {
      aspectRatio: p.majorRadius / a,
      plasmaVolume: components[0].volume,
      firstWallArea: revolveSurfaceArea(loop(p, dSol, 192)),
      totalMass: components.reduce((sum, c) => sum + (c.mass ?? 0), 0),
      outerRadius: cryoR,
      height: 2 * cryoH,
    },
    components,
  };
}
