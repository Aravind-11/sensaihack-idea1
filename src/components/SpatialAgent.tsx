import { Billboard, RoundedBox, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Group, Vector3 } from 'three'
import type { Vec3Tuple } from '../types/audit'

type SpatialAgentProps = {
  id: string
  position: Vec3Tuple
  thought: string
  intent?: string
  speedMps?: number
  seeing?: string[]
  color?: string
  focused?: boolean
  renderBody?: boolean
}

const tempVector = new Vector3()

/** A Billboard popup card that smoothly scales in/out on hover. */
function AgentPopup({
  id,
  thought,
  intent,
  speedMps,
  seeing,
  color,
  visible,
}: {
  id: string
  thought: string
  intent?: string
  speedMps?: number
  seeing?: string[]
  color: string
  visible: boolean
}) {
  const groupRef = useRef<Group>(null)
  const scaleRef = useRef(0)

  useFrame((_state, delta) => {
    if (!groupRef.current) return
    const target = visible ? 1 : 0
    scaleRef.current += (target - scaleRef.current) * Math.min(1, delta * 12)
    const s = scaleRef.current
    groupRef.current.scale.set(s, s, s)
  })

  const seeingLines = (seeing ?? []).slice(0, 3)
  const speedText = speedMps !== undefined ? `${speedMps.toFixed(1)} m/s` : null

  // Panel dimensions
  const panelW = 2.2
  const panelH = 1.05 + seeingLines.length * 0.18

  return (
    <group ref={groupRef} scale={[0, 0, 0]}>
      <Billboard position={[0, 0, 0]}>
        {/* Background card */}
        <RoundedBox args={[panelW, panelH, 0.04]} radius={0.08} smoothness={4}>
          <meshStandardMaterial
            color="#0a0e1a"
            transparent
            opacity={0.88}
            roughness={0.4}
          />
        </RoundedBox>

        {/* Colored accent top bar */}
        <RoundedBox
          args={[panelW - 0.04, 0.18, 0.05]}
          radius={0.06}
          smoothness={4}
          position={[0, panelH / 2 - 0.1, 0.01]}
        >
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
        </RoundedBox>

        {/* Agent ID */}
        <Text
          position={[-0.55, panelH / 2 - 0.1, 0.06]}
          fontSize={0.12}
          fontWeight={700}
          color="#f8fafc"
          anchorX="left"
          anchorY="middle"
          outlineColor="#020617"
          outlineWidth={0.01}
        >
          {id}
        </Text>

        {/* Speed badge */}
        {speedText && (
          <Text
            position={[0.72, panelH / 2 - 0.1, 0.06]}
            fontSize={0.1}
            color="#94a3b8"
            anchorX="right"
            anchorY="middle"
          >
            {speedText}
          </Text>
        )}

        {/* Thought */}
        <Text
          position={[0, panelH / 2 - 0.33, 0.06]}
          fontSize={0.105}
          maxWidth={panelW - 0.22}
          color="#e2e8f0"
          anchorX="center"
          anchorY="top"
          outlineColor="#020617"
          outlineWidth={0.008}
        >
          {thought}
        </Text>

        {/* Intent */}
        {intent && intent.trim().length > 0 && (
          <Text
            position={[0, panelH / 2 - 0.64, 0.06]}
            fontSize={0.095}
            maxWidth={panelW - 0.22}
            color="#67e8f9"
            anchorX="center"
            anchorY="top"
          >
            {`→ ${intent}`}
          </Text>
        )}

        {/* Seeing list */}
        {seeingLines.map((item, i) => (
          <Text
            key={i}
            position={[-(panelW / 2 - 0.16), panelH / 2 - 0.82 - i * 0.18, 0.06]}
            fontSize={0.085}
            color="#a78bfa"
            anchorX="left"
            anchorY="top"
          >
            {`• ${item}`}
          </Text>
        ))}
      </Billboard>
    </group>
  )
}

export function SpatialAgent({
  id,
  position,
  thought,
  intent,
  speedMps,
  seeing,
  color = '#7dd3fc',
  focused = false,
  renderBody = true,
}: SpatialAgentProps) {
  const groupRef = useRef<Group>(null)
  const [isHovered, setIsHovered] = useState(false)

  useFrame((_state, delta) => {
    if (!groupRef.current) return
    tempVector.set(position[0], position[1], position[2])
    groupRef.current.position.lerp(tempVector, Math.min(1, delta * 3))
  })

  return (
    <group ref={groupRef}>
      {renderBody && (
        <>
          {/* Car body — pointer events for hover (works in WebXR via controller raycasting) */}
          <mesh
            castShadow
            receiveShadow
            onPointerOver={(e) => { e.stopPropagation(); setIsHovered(true) }}
            onPointerOut={() => setIsHovered(false)}
          >
            <boxGeometry args={[1.5, 0.56, 0.90]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isHovered ? 0.6 : focused ? 0.45 : 0.2}
              roughness={0.35}
            />
          </mesh>

          <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.4, focused || isHovered ? 0.52 : 0.48, 40]} />
            <meshBasicMaterial color={color} transparent opacity={isHovered ? 1 : focused ? 0.85 : 0.5} />
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
        </>
      )}

      {/* Always-visible small label */}
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

      {/* Hover popup panel — floats above the label */}
      <group position={[0, renderBody ? 2.0 : 1.2, 0]}>
        <AgentPopup
          id={id}
          thought={thought}
          intent={intent}
          speedMps={speedMps}
          seeing={seeing}
          color={color}
          visible={isHovered}
        />
      </group>
    </group>
  )
}
