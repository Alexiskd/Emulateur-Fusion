import * as THREE from 'three';
import type { Point } from '../types';

const TAU = Math.PI * 2;
/** Au-delà de cet angle entre deux arêtes du profil, l'arête reste vive. */
const SMOOTH_COS = Math.cos((35 * Math.PI) / 180);

function signedArea(loop: Point[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [r0, z0] = loop[i];
    const [r1, z1] = loop[(i + 1) % loop.length];
    a += r0 * z1 - r1 * z0;
  }
  return a / 2;
}

/**
 * Surface de révolution d'un contour fermé (r, z) autour de l'axe vertical Y.
 * `inward` oriente les normales vers l'intérieur du contour (paroi d'un trou).
 */
function revolveSurface(loop: Point[], phiLength: number, segments: number, inward: boolean): THREE.BufferGeometry {
  const n = loop.length;
  const sign = (signedArea(loop) >= 0 ? 1 : -1) * (inward ? -1 : 1);

  const edgeNormals: Point[] = loop.map(([r0, z0], i) => {
    const [r1, z1] = loop[(i + 1) % n];
    const len = Math.hypot(r1 - r0, z1 - z0) || 1;
    return [(sign * (z1 - z0)) / len, (-sign * (r1 - r0)) / len];
  });
  const blend = (own: Point, other: Point): Point => {
    if (own[0] * other[0] + own[1] * other[1] < SMOOTH_COS) return own;
    const len = Math.hypot(own[0] + other[0], own[1] + other[1]) || 1;
    return [(own[0] + other[0]) / len, (own[1] + other[1]) / len];
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = loop[i];
    const p1 = loop[(i + 1) % n];
    const n0 = blend(edgeNormals[i], edgeNormals[(i - 1 + n) % n]);
    const n1 = blend(edgeNormals[i], edgeNormals[(i + 1) % n]);
    const base = positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * phiLength;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      positions.push(p0[0] * s, p0[1], p0[0] * c, p1[0] * s, p1[1], p1[0] * c);
      normals.push(n0[0] * s, n0[1], n0[0] * c, n1[0] * s, n1[1], n1[0] * c);
    }
    for (let j = 0; j < segments; j++) {
      const a = base + 2 * j;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (sign > 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function toShape(outer: Point[], inner?: Point[]): THREE.Shape {
  const shape = new THREE.Shape(outer.map(([r, z]) => new THREE.Vector2(r, z)));
  if (inner) shape.holes.push(new THREE.Path(inner.map(([r, z]) => new THREE.Vector2(r, z))));
  return shape;
}

/**
 * Solide de révolution, éventuellement creux. Si `phiLength` < 2π, les deux faces
 * de coupe sont ajoutées pour montrer la section du composant.
 */
export function buildRevolve(outer: Point[], inner: Point[] | undefined, phiLength: number): THREE.BufferGeometry[] {
  const segments = Math.max(12, Math.round((96 * phiLength) / TAU));
  const parts = [revolveSurface(outer, phiLength, segments, false)];
  if (inner) parts.push(revolveSurface(inner, phiLength, segments, true));

  if (phiLength < TAU - 1e-6) {
    const shape = toShape(outer, inner);
    // Le plan (r, z) du profil correspond au demi-plan d'azimut φ après rotation de φ − π/2.
    parts.push(new THREE.ShapeGeometry(shape).rotateY(-Math.PI / 2));
    parts.push(new THREE.ShapeGeometry(shape).rotateY(phiLength - Math.PI / 2));
  }
  return parts;
}

/** Bobine plane : section (r, z) extrudée dans la direction toroïdale, centrée sur son plan. */
export function buildCoil(outer: Point[], inner: Point[], depth: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(toShape(outer, inner), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
