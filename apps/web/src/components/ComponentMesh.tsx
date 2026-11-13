import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildCoil, buildRevolve } from '../three/buildGeometry';
import type { ReactorComponent } from '../types';

const TAU = Math.PI * 2;

interface Props {
  component: ReactorComponent;
  /** Étendue angulaire conservée autour de l'axe (2π = machine complète). */
  phiLength: number;
  /** Décalages de la vue éclatée, déjà mis à l'échelle de la machine (m). */
  verticalStep: number;
  radialStep: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function ComponentMesh({ component, phiLength, verticalStep, radialStep, selected, onSelect }: Props) {
  const { geometry, explode, color, opacity } = component;

  const geometries = useMemo(
    () =>
      geometry.kind === 'revolve'
        ? buildRevolve(geometry.outer, geometry.inner, phiLength)
        : [buildCoil(geometry.outer, geometry.inner, geometry.depth)],
    [geometry, phiLength],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  const transparent = opacity < 1;
  const isPlasma = component.group === 'plasma';
  const material = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={isPlasma ? 0.9 : selected ? 0.45 : 0}
      roughness={0.6}
      metalness={0.15}
      side={THREE.DoubleSide}
      transparent={transparent}
      opacity={opacity}
      depthWrite={!transparent}
    />
  );

  // Les enveloppes très transparentes (cryostat) ne doivent pas intercepter les clics.
  const pickable = opacity >= 0.3;
  const handlers = pickable
    ? {
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onSelect(component.id);
        },
      }
    : { raycast: () => null };

  if (geometry.kind === 'coilArray') {
    const coils = [];
    for (let k = 0; k < geometry.count; k++) {
      const phi = ((k + 0.5) / geometry.count) * TAU;
      if (phi > phiLength) continue;
      const offset = explode.radial * radialStep;
      coils.push(
        <mesh
          key={k}
          geometry={geometries[0]}
          rotation={[0, phi - Math.PI / 2, 0]}
          position={[Math.sin(phi) * offset, explode.vertical * verticalStep, Math.cos(phi) * offset]}
          {...handlers}
        >
          {material}
        </mesh>,
      );
    }
    return <group>{coils}</group>;
  }

  return (
    <group position={[0, explode.vertical * verticalStep, 0]}>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={transparent ? 1 : 0} {...handlers}>
          {material}
        </mesh>
      ))}
    </group>
  );
}
