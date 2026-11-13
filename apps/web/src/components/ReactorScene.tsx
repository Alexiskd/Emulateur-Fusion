import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { ReactorModel } from '../types';
import { ComponentMesh } from './ComponentMesh';

const TAU = Math.PI * 2;

interface Props {
  model: ReactorModel;
  hidden: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 0 = assemblé, 1 = entièrement éclaté. */
  explode: number;
  /** Secteur retiré pour la vue en coupe, en degrés. */
  cutDegrees: number;
}

/** Recadre la caméra quand la taille de la machine change (ex. changement de preset). */
function CameraRig({ size }: { size: number }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, size * 0.9, size * 2.4);
    camera.near = size / 100;
    camera.far = size * 40;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export function ReactorScene({ model, hidden, selectedId, onSelect, explode, cutDegrees }: Props) {
  const { outerRadius, height } = model.summary;
  const size = Math.max(outerRadius, height / 2);
  const cut = (cutDegrees * Math.PI) / 180;
  const phiLength = TAU - cut;

  return (
    <Canvas camera={{ fov: 40 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#0b0f17']} />
      <CameraRig size={size} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[size, size * 2, size * 1.5]} intensity={1.8} />
      <directionalLight position={[-size * 1.5, size * 0.5, -size]} intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={size * size * 4} color="#ff9be8" />

      {/* Rotation pour que le secteur retiré fasse face à la caméra. */}
      <group rotation={[0, cut / 2, 0]}>
        {model.components
          .filter((c) => !hidden.has(c.id))
          .map((c) => (
            <ComponentMesh
              key={c.id}
              component={c}
              phiLength={phiLength}
              verticalStep={explode * height * 0.14}
              radialStep={explode * outerRadius * 0.7}
              selected={c.id === selectedId}
              onSelect={onSelect}
            />
          ))}
      </group>

      <gridHelper args={[size * 6, 30, '#2a3a4d', '#18212c']} position={[0, -height / 2, 0]} />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}
