import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, Vector3 } from 'three'
import type { Vec3Tuple } from '../types/audit'

type SpatialAgentProps = {
  id: string
  position: Vec3Tuple
  thought: string
  intent?: string
  speedMps?: number
  seeing?: string[]
  direction?: Vec3Tuple
  color?: string
  focused?: boolean
  renderBody?: boolean
}

const tempVector = new Vector3()

export function SpatialAgent({
  id,
  position,
  thought,
  direction = [1, 0, 0],
  color = '#7dd3fc',
  focused = false,
  renderBody = true,
}: SpatialAgentProps) {
  const groupRef = useRef<Group>(null)
  const directionYaw = Math.atan2(-direction[2], direction[0])

  useFrame((_state, delta) => {
    if (!groupRef.current) return
    tempVector.set(position[0], position[1], position[2])
    groupRef.current.position.lerp(tempVector, Math.min(1, delta * 3))
  })

  return (
    <group ref={groupRef}>
      {renderBody && (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.5, 0.56, 0.90]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={focused ? 0.45 : 0.2}
              roughness={0.35}
            />
          </mesh>

          <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.4, focused ? 0.52 : 0.48, 40]} />
            <meshBasicMaterial color={color} transparent opacity={focused ? 0.85 : 0.5} />
          </mesh>

          <mesh position={[-0.5, -0.24, 0.45]} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
            <meshStandardMaterial color="#0b1120" />
          </mesh>
          <mesh position={[0.5, -0.24, 0.45]} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
            <meshStandardMaterial color="#0b1120" />
          </mesh>

          <mesh position={[-0.5, -.12, -0.45]} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
            <meshStandardMaterial color="#0b1120" />
          </mesh>
          <mesh position={[0.5, -.12, -0.45]} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
            <meshStandardMaterial color="#0b1120" />
          </mesh>

          <mesh position={[1, 0, 0]} rotation={[0, Math.PI, -Math.PI / 2]}>
            <coneGeometry args={[1, 1.4, 24, 1, true]} />
            <meshStandardMaterial
              color="#67e8f9"
              emissive="#67e8f9"
              emissiveIntensity={0.3}
              transparent
              opacity={0.18}
              side={2}
            />
          </mesh>
          <group position={[0, 0.19, 0]} rotation={[0, directionYaw, 0]}>
            <mesh position={[0.23, 0, 0]}>
              <cylinderGeometry args={[0.024, 0.024, 0.24, 8]} />
              <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={0.55} />
            </mesh>
            <mesh position={[0.41, 0, 0]}>
              <coneGeometry args={[0.07, 0.13, 12]} />
              <meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={0.6} />
            </mesh>
          </group>
        </>
      )}

      <Billboard position={[0, renderBody ? 0.96 : 0.4, 0]}>
        <Text
          fontSize={0.14}
          maxWidth={2.8}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
          outlineColor="#020617"
          outlineWidth={0.02}
        >
          {`${id}: ${thought}`}
        </Text>
      </Billboard>
    </group>
  )
}
