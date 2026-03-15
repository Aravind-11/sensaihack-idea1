import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Line, OrbitControls, Sky, Text } from '@react-three/drei'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { buildDemoLogChain, type ScenarioId, verifyLogChainInBatches } from './audit/clientLog'
import { buildAgentStateAtTick, getInteractionsAtTick, getMaxTick } from './audit/replay'
import { MissionControlHUD, type CustomAgentDraft } from './components/MissionControl'
import { SpatialAgent } from './components/SpatialAgent'
import type { AgentInteraction, AuditEvent, Vec3Tuple } from './types/audit'
import { Vector3, type Group } from 'three'

const xrStore = createXRStore({
  emulate: false,
  offerSession: false,
})
const MAX_HUD_AGENTS = 4
type PerformanceMode = 'low' | 'medium' | 'high'
type RuntimeAgent = CustomAgentDraft & { createdAtTick: number }
type MockAgentPlanRequest = {
  endpoint: string
  method: 'POST'
  headers: Record<string, string>
  body: Record<string, unknown>
}

type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number }
type ScenarioConfig = {
  laneGuides: Vec3Tuple[][]
  dashedMarks: Vec3Tuple[][]
  crosswalks: Array<{ position: Vec3Tuple; rotationY?: number }>
  arrows: Array<{ position: Vec3Tuple; rotationY?: number }>
  minimapBounds: MinimapBounds
  sky: string
}

const cityLaneGuides: Vec3Tuple[][] = [
  [[-6, 0.03, -1.4], [6, 0.03, -1.4]],
  [[-6, 0.03, 1.4], [6, 0.03, 1.4]],
  [[-1.4, 0.03, -6], [-1.4, 0.03, 6]],
  [[1.4, 0.03, -6], [1.4, 0.03, 6]],
]

const cityDashedMarks: Vec3Tuple[][] = [
  [[-6, 0.04, 0], [-5.2, 0.04, 0]],
  [[-4.2, 0.04, 0], [-3.4, 0.04, 0]],
  [[-2.4, 0.04, 0], [-1.6, 0.04, 0]],
  [[1.6, 0.04, 0], [2.4, 0.04, 0]],
  [[3.4, 0.04, 0], [4.2, 0.04, 0]],
  [[5.2, 0.04, 0], [6, 0.04, 0]],
  [[0, 0.04, -6], [0, 0.04, -5.2]],
  [[0, 0.04, -4.2], [0, 0.04, -3.4]],
  [[0, 0.04, -2.4], [0, 0.04, -1.6]],
  [[0, 0.04, 1.6], [0, 0.04, 2.4]],
  [[0, 0.04, 3.4], [0, 0.04, 4.2]],
  [[0, 0.04, 5.2], [0, 0.04, 6]],
]

const highwayLaneGuides: Vec3Tuple[][] = [
  [[-12, 0.03, -2.2], [12, 0.03, -2.2]],
  [[-12, 0.03, 2.2], [12, 0.03, 2.2]],
]

const highwayDashedMarks: Vec3Tuple[][] = [
  [[-12, 0.04, 0], [-10.8, 0.04, 0]],
  [[-9.4, 0.04, 0], [-8.2, 0.04, 0]],
  [[-6.8, 0.04, 0], [-5.6, 0.04, 0]],
  [[-4.2, 0.04, 0], [-3, 0.04, 0]],
  [[-1.6, 0.04, 0], [-0.4, 0.04, 0]],
  [[1, 0.04, 0], [2.2, 0.04, 0]],
  [[3.6, 0.04, 0], [4.8, 0.04, 0]],
  [[6.2, 0.04, 0], [7.4, 0.04, 0]],
  [[8.8, 0.04, 0], [10, 0.04, 0]],
]

const roundaboutLaneGuides: Vec3Tuple[][] = [
  [[-8, 0.03, 0], [8, 0.03, 0]],
  [[0, 0.03, -8], [0, 0.03, 8]],
]

const roundaboutDashedMarks: Vec3Tuple[][] = [
  [[-8, 0.04, 0], [-6.8, 0.04, 0]],
  [[6.8, 0.04, 0], [8, 0.04, 0]],
  [[0, 0.04, -8], [0, 0.04, -6.8]],
  [[0, 0.04, 6.8], [0, 0.04, 8]],
]

const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  'city-merge': {
    laneGuides: cityLaneGuides,
    dashedMarks: cityDashedMarks,
    crosswalks: [
      { position: [0, 0.041, -3.1] },
      { position: [0, 0.041, 3.1] },
      { position: [-3.1, 0.041, 0], rotationY: Math.PI / 2 },
      { position: [3.1, 0.041, 0], rotationY: Math.PI / 2 },
    ],
    arrows: [
      { position: [-3.8, 0.041, -1.2], rotationY: 0 },
      { position: [3.4, 0.041, 1.2], rotationY: Math.PI },
      { position: [-1.2, 0.041, -3.8], rotationY: Math.PI / 2 },
      { position: [1.2, 0.041, 3.8], rotationY: -Math.PI / 2 },
    ],
    minimapBounds: { minX: -7, maxX: 7, minZ: -7, maxZ: 7 },
    sky: '#cfe8ff',
  },
  highway: {
    laneGuides: highwayLaneGuides,
    dashedMarks: highwayDashedMarks,
    crosswalks: [],
    arrows: [
      { position: [-8.2, 0.041, -1.2], rotationY: 0 },
      { position: [-4.2, 0.041, 1.2], rotationY: 0 },
      { position: [1.2, 0.041, -1.2], rotationY: 0 },
      { position: [6.4, 0.041, 1.2], rotationY: 0 },
    ],
    minimapBounds: { minX: -12, maxX: 12, minZ: -4, maxZ: 4 },
    sky: '#dbeafe',
  },
  roundabout: {
    laneGuides: roundaboutLaneGuides,
    dashedMarks: roundaboutDashedMarks,
    crosswalks: [
      { position: [0, 0.041, -5.7] },
      { position: [0, 0.041, 5.7] },
      { position: [-5.7, 0.041, 0], rotationY: Math.PI / 2 },
      { position: [5.7, 0.041, 0], rotationY: Math.PI / 2 },
    ],
    arrows: [
      { position: [0, 0.041, -4], rotationY: Math.PI / 2 },
      { position: [4, 0.041, 0], rotationY: Math.PI },
      { position: [0, 0.041, 4], rotationY: -Math.PI / 2 },
      { position: [-4, 0.041, 0], rotationY: 0 },
    ],
    minimapBounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 },
    sky: '#e0f2fe',
  },
}

function BuildingBlock({ position, size, color }: { position: Vec3Tuple; size: Vec3Tuple; color: string }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.2} />
      </mesh>
      <mesh position={[0, size[1] * 0.1, size[2] / 2 + 0.01]}>
        <planeGeometry args={[size[0] * 0.65, size[1] * 0.5]} />
        <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.25} transparent opacity={0.75} />
      </mesh>
    </group>
  )
}

function Tree({ position }: { position: Vec3Tuple }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.08, 0.11, 1.1, 10]} />
        <meshStandardMaterial color="#7c4a24" />
      </mesh>
      <mesh castShadow position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color="#2e7d32" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.28, 1.25, 0.1]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#388e3c" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[-0.24, 1.22, -0.14]}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#43a047" roughness={0.8} />
      </mesh>
    </group>
  )
}

function LampPost({ position }: { position: Vec3Tuple }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.06, 2.2, 10]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <boxGeometry args={[0.34, 0.08, 0.34]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <pointLight position={[0, 1.1, 0]} color="#fff7cc" intensity={0.2} distance={5.5} />
    </group>
  )
}

const forwardVector = new Vector3()
const rightVector = new Vector3()
const movementDelta = new Vector3()
const KEYBOARD_DEADZONE = 0.01
const CONTROLLER_DEADZONE = 0.18
const TURN_INPUT_DEADZONE = 0.65
const SNAP_TURN_RADIANS = Math.PI / 8

type DirectionalRuntimeAgentState = {
  visual: { position: Vec3Tuple; thought: string; intent: string; speed_mps: number; seeing: string[] }
  color: string
  direction: Vec3Tuple
}

const buildMockAgentPlanRequest = (
  agent: RuntimeAgent,
  snapshot: { tick: number; speedMps: number; position: Vec3Tuple; intent: string },
): MockAgentPlanRequest => {
  // Intentionally no fetch() call: we only model request payload/headers for explainability.
  return {
    endpoint: `https://api.${agent.apiProvider}.com/v1/chat/completions`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agent.apiKey || '<missing-key>'}`,
      'Content-Type': 'application/json',
      'X-Agent-ID': agent.id,
    },
    body: {
      model: agent.apiModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are the planner for ${agent.id}. Behavior profile=${agent.behavior}.`,
        },
        {
          role: 'user',
          content: `tick=${snapshot.tick}, intent=${snapshot.intent}, speed=${snapshot.speedMps}, position=${snapshot.position.join(',')}.`,
        },
      ],
    },
  }
}

type PlayerRigProps = {
  onStepTick: (delta: number) => void
  onXRPresentingChange: (presenting: boolean) => void
}

const getStickAxes = (gamepad: Gamepad): { x: number; y: number } => {
  const primaryX = gamepad.axes[0] ?? 0
  const primaryY = gamepad.axes[1] ?? 0
  const altX = gamepad.axes[2] ?? 0
  const altY = gamepad.axes[3] ?? 0
  const primaryMagnitude = primaryX * primaryX + primaryY * primaryY
  const altMagnitude = altX * altX + altY * altY
  return altMagnitude > primaryMagnitude ? { x: altX, y: altY } : { x: primaryX, y: primaryY }
}

function PlayerRig({ onStepTick, onXRPresentingChange }: PlayerRigProps) {
  const originRef = useRef<Group>(null)
  const keysRef = useRef<Record<string, boolean>>({})
  const triggerLatchRef = useRef<Record<'left' | 'right', boolean>>({ left: false, right: false })
  const turnLatchRef = useRef(false)
  const xrPresentingRef = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame((state, delta) => {
    if (!originRef.current) return
    const presenting = state.gl.xr.isPresenting
    if (xrPresentingRef.current !== presenting) {
      xrPresentingRef.current = presenting
      onXRPresentingChange(presenting)
    }
    const keys = keysRef.current
    const baseSpeed = keys.shift ? 5.2 : 2.8
    const step = baseSpeed * delta
    let moveX = 0
    let moveZ = 0
    let turnAxisX = 0

    if (keys.w || keys.arrowup) moveZ -= 1
    if (keys.s || keys.arrowdown) moveZ += 1
    if (keys.a || keys.arrowleft) moveX -= 1
    if (keys.d || keys.arrowright) moveX += 1
    if (keys.q) turnAxisX = -1
    if (keys.e) turnAxisX = 1

    const xrSession = state.gl.xr.getSession()
    if (xrSession) {
      for (const source of xrSession.inputSources) {
        if (source.handedness !== 'left' && source.handedness !== 'right') continue
        const gamepad = source.gamepad
        if (!gamepad) continue
        const { x: axisX, y: axisY } = getStickAxes(gamepad)

        // Keep locomotion bound to left stick and turning bound to right stick.
        if (source.handedness === 'left') {
          if (Math.abs(axisX) > CONTROLLER_DEADZONE) moveX += axisX
          if (Math.abs(axisY) > CONTROLLER_DEADZONE) moveZ += axisY
        } else if (source.handedness === 'right') {
          if (Math.abs(axisX) > CONTROLLER_DEADZONE) turnAxisX = axisX
        }

        const triggerPressed = Boolean(gamepad.buttons[0]?.pressed)
        const hand = source.handedness
        if (triggerPressed && !triggerLatchRef.current[hand]) {
          onStepTick(hand === 'right' ? 1 : -1)
        }
        triggerLatchRef.current[hand] = triggerPressed
      }
    }

    if (Math.abs(turnAxisX) > TURN_INPUT_DEADZONE) {
      if (!turnLatchRef.current) {
        originRef.current.rotation.y += turnAxisX > 0 ? -SNAP_TURN_RADIANS : SNAP_TURN_RADIANS
        turnLatchRef.current = true
      }
    } else {
      turnLatchRef.current = false
    }

    if (Math.abs(moveX) <= KEYBOARD_DEADZONE && Math.abs(moveZ) <= KEYBOARD_DEADZONE) return
    forwardVector.set(0, 0, -1).applyQuaternion(state.camera.quaternion)
    rightVector.set(1, 0, 0).applyQuaternion(state.camera.quaternion)
    forwardVector.y = 0
    rightVector.y = 0
    if (forwardVector.lengthSq() > 0) forwardVector.normalize()
    if (rightVector.lengthSq() > 0) rightVector.normalize()
    movementDelta.set(0, 0, 0)
    movementDelta.addScaledVector(forwardVector, -moveZ * step)
    movementDelta.addScaledVector(rightVector, moveX * step)
    originRef.current.position.add(movementDelta)
  })

  return <XROrigin ref={originRef} position={[0, 0, 0]} />
}

function TrafficLights({ tick, scenario }: { tick: number; scenario: ScenarioId }) {
  const cycle = Math.floor((tick - 1) / 2) % 3
  const cityState = cycle === 0 ? 'green-x' : cycle === 1 ? 'yellow' : 'green-z'
  const highwayState = cycle === 0 ? 'green' : cycle === 1 ? 'yellow' : 'red'
  const getColor = (active: boolean, base: string): string => (active ? base : '#111827')
  const current = scenario === 'city-merge' ? cityState : highwayState

  const lightPositions: Vec3Tuple[] =
    scenario === 'city-merge'
      ? [[-2.8, 1.2, -2.8], [2.8, 1.2, -2.8], [-2.8, 1.2, 2.8], [2.8, 1.2, 2.8]]
      : scenario === 'highway'
        ? [[-9.5, 1.2, 0], [0, 1.2, 0], [9.5, 1.2, 0]]
        : [[0, 1.2, -5.3], [5.3, 1.2, 0], [0, 1.2, 5.3], [-5.3, 1.2, 0]]

  return (
    <group>
      {lightPositions.map((pos, index) => (
        <group key={`tl-${index}`} position={pos}>
          <mesh castShadow>
            <boxGeometry args={[0.25, 1.4, 0.25]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[0.45, 0.95, 0.18]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, 1.02, 0.1]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={getColor(current === 'red', '#ef4444')} emissive={getColor(current === 'red', '#ef4444')} emissiveIntensity={0.65} />
          </mesh>
          <mesh position={[0, 0.8, 0.1]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={getColor(current === 'yellow', '#f59e0b')} emissive={getColor(current === 'yellow', '#f59e0b')} emissiveIntensity={0.65} />
          </mesh>
          <mesh position={[0, 0.58, 0.1]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial
              color={getColor(current === 'green' || current === 'green-x' || current === 'green-z', '#22c55e')}
              emissive={getColor(current === 'green' || current === 'green-x' || current === 'green-z', '#22c55e')}
              emissiveIntensity={0.65}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Crosswalk({ position, rotationY = 0 }: { position: Vec3Tuple; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: 7 }).map((_, index) => (
        <mesh key={`cw-${index}`} position={[-1.8 + index * 0.6, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.35, 1.2]} />
          <meshStandardMaterial color="#f8fafc" opacity={0.86} transparent />
        </mesh>
      ))}
    </group>
  )
}

function LaneArrow({ position, rotationY = 0 }: { position: Vec3Tuple; rotationY?: number }) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, rotationY]}>
      <mesh>
        <planeGeometry args={[0.95, 0.22]} />
        <meshStandardMaterial color="#f8fafc" opacity={0.78} transparent />
      </mesh>
      <mesh position={[0.52, 0, 0]}>
        <coneGeometry args={[0.18, 0.36, 3]} />
        <meshStandardMaterial color="#f8fafc" opacity={0.78} transparent />
      </mesh>
    </group>
  )
}

function WorldGeometry({ scenario }: { scenario: ScenarioId }) {
  if (scenario === 'highway') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={1} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[56, 8]} />
          <meshStandardMaterial color="#0b1220" roughness={0.96} />
        </mesh>
        <mesh position={[0, 0.08, -3.8]} receiveShadow>
          <boxGeometry args={[56, 0.18, 0.22]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 0.08, 3.8]} receiveShadow>
          <boxGeometry args={[56, 0.18, 0.22]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>
    )
  }

  if (scenario === 'roundabout') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[48, 48]} />
          <meshStandardMaterial color="#0f172a" roughness={1} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[28, 4.6]} />
          <meshStandardMaterial color="#0b1220" roughness={0.98} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[4.6, 28]} />
          <meshStandardMaterial color="#0b1220" roughness={0.98} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[2.2, 4.2, 48]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.9, 36]} />
          <meshStandardMaterial color="#14532d" />
        </mesh>
      </group>
    )
  }

  const buildingBlocks: Array<{ pos: Vec3Tuple; size: Vec3Tuple; color: string }> = [
    { pos: [-5.4, 1.6, -4.9], size: [1.8, 3.2, 1.8], color: '#1e293b' },
    { pos: [-3.2, 1.2, -5.2], size: [1.6, 2.4, 1.6], color: '#334155' },
    { pos: [3.4, 1.8, -5.0], size: [1.8, 3.6, 1.8], color: '#1e293b' },
    { pos: [5.5, 1.3, -4.8], size: [1.4, 2.6, 1.6], color: '#334155' },
    { pos: [-5.3, 1.4, 4.8], size: [1.6, 2.8, 1.7], color: '#334155' },
    { pos: [-3.0, 1.8, 5.0], size: [1.8, 3.6, 1.8], color: '#1e293b' },
    { pos: [3.1, 1.1, 5.1], size: [1.6, 2.2, 1.5], color: '#334155' },
    { pos: [5.5, 1.7, 4.9], size: [1.5, 3.4, 1.7], color: '#1e293b' },
  ]
  const treeRows: Vec3Tuple[] = [
    [-8.4, 0, -8.4], [-5.4, 0, -8.6], [-2.4, 0, -8.2], [0.8, 0, -8.4], [3.8, 0, -8.5], [6.8, 0, -8.1],
    [-8.5, 0, 8.3], [-5.6, 0, 8.2], [-2.5, 0, 8.4], [0.5, 0, 8.3], [3.6, 0, 8.2], [6.7, 0, 8.5],
    [-8.4, 0, -5.5], [-8.3, 0, -2.4], [-8.2, 0, 0.6], [-8.6, 0, 3.6], [-8.3, 0, 6.7],
    [8.5, 0, -5.3], [8.2, 0, -2.2], [8.4, 0, 0.7], [8.3, 0, 3.5], [8.4, 0, 6.8],
  ]

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#8fbf7a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#9bcf86" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 4.6]} />
        <meshStandardMaterial color="#303640" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.6, 24]} />
        <meshStandardMaterial color="#303640" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 0.3]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.3, 24]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.05, -2.55]} receiveShadow>
        <boxGeometry args={[24, 0.14, 0.22]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      <mesh position={[0, 0.05, 2.55]} receiveShadow>
        <boxGeometry args={[24, 0.14, 0.22]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      <mesh position={[-2.55, 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.22, 0.14, 24]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      <mesh position={[2.55, 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.22, 0.14, 24]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>

      {buildingBlocks.map((building, idx) => (
        <BuildingBlock key={`building-${idx}`} position={building.pos} size={building.size} color={building.color} />
      ))}

      {treeRows.map((treePos, index) => (
        <Tree key={`tree-${index}`} position={treePos} />
      ))}

      {[
        [-3.4, 0.9, -3.4],
        [3.4, 0.9, -3.4],
        [-3.4, 0.9, 3.4],
        [3.4, 0.9, 3.4],
      ].map((lamp, index) => (
        <LampPost key={`lamp-${index}`} position={lamp as Vec3Tuple} />
      ))}
    </group>
  )
}

function App() {
  const [logs, setLogs] = useState<AuditEvent[]>([])
  const [currentTick, setCurrentTick] = useState(0)
  const [runtimeAgents, setRuntimeAgents] = useState<RuntimeAgent[]>([])
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const [isXRPresenting, setIsXRPresenting] = useState(false)
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [scenario, setScenario] = useState<ScenarioId>('city-merge')
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('medium')
  const [xrDiagText, setXrDiagText] = useState('')
  const [xrActionText, setXrActionText] = useState('')
  const [isVerifyingIntegrity, setIsVerifyingIntegrity] = useState(false)
  const [verifyProgress, setVerifyProgress] = useState(0)

  useEffect(() => {
    let active = true
    buildDemoLogChain(scenario).then((chain) => {
      if (!active) return
      setLogs(chain)
      setCurrentTick(getMaxTick(chain))
      setRuntimeAgents([])
      setIsReplayPlaying(false)
      setFocusedAgentId(null)
    })
    return () => {
      active = false
    }
  }, [scenario])
  useEffect(() => {
    if (!isXRPresenting) return
    setIsReplayPlaying(false)
  }, [isXRPresenting])

  const maxTick = useMemo(() => getMaxTick(logs), [logs])
  const agentStates = useMemo(() => buildAgentStateAtTick(logs, currentTick), [logs, currentTick])
  const visibleAgentIds = useMemo(
    () => Array.from(new Set(logs.map((log) => log.agent_id))).slice(0, MAX_HUD_AGENTS),
    [logs],
  )
  const visibleLogs = useMemo(
    () => logs.filter((log) => visibleAgentIds.includes(log.agent_id)),
    [logs, visibleAgentIds],
  )
  const visibleAgentStates = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(agentStates).filter(([agentId]) => visibleAgentIds.includes(agentId)),
      ),
    [agentStates, visibleAgentIds],
  )
  const interactions = useMemo<AgentInteraction[]>(() => getInteractionsAtTick(logs, currentTick), [logs, currentTick])
  const runtimeAgentStates = useMemo(() => {
    const evaluateMotion = (agent: RuntimeAgent, elapsed: number): { x: number; z: number; speed: number } => {
      const baseX = agent.position[0]
      const baseZ = agent.position[2]
      let x = baseX
      let z = baseZ
      let speed = agent.speedMps
      if (agent.behavior === 'cautious') {
        x = baseX + Math.sin(elapsed * 0.24) * 0.7
        z = baseZ + Math.cos(elapsed * 0.2) * 0.4
        speed = Math.max(1.2, agent.speedMps * 0.75)
      } else if (agent.behavior === 'assertive') {
        x = baseX + elapsed * 0.22
        z = baseZ + Math.sin(elapsed * 0.32) * 0.5
        speed = agent.speedMps * 1.2
      } else if (agent.behavior === 'cooperative') {
        x = baseX + Math.sin(elapsed * 0.27) * 1.1
        z = baseZ + Math.cos(elapsed * 0.27) * 1.1
        speed = agent.speedMps
      } else {
        const noteHash = agent.behaviorNotes
          .split('')
          .reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
        const drift = ((noteHash % 7) + 2) / 20
        x = baseX + Math.sin(elapsed * drift) * 0.9
        z = baseZ + Math.cos(elapsed * drift) * 0.6
      }
      return { x, z, speed }
    }

    const state: Record<string, DirectionalRuntimeAgentState> = {}
    for (const agent of runtimeAgents) {
      const elapsed = Math.max(0, currentTick - agent.createdAtTick)
      const now = evaluateMotion(agent, elapsed)
      const next = evaluateMotion(agent, elapsed + 0.45)
      const dx = next.x - now.x
      const dz = next.z - now.z
      const magnitude = Math.hypot(dx, dz) || 1
      state[agent.id] = {
        visual: {
          position: [now.x, 0.4, now.z],
          thought: `${agent.thought} [${agent.behavior}]`,
          intent: agent.intent,
          speed_mps: Number(now.speed.toFixed(1)),
          seeing: [],
        },
        color: agent.color,
        direction: [dx / magnitude, 0, dz / magnitude],
      }
      if (agent.enableApiPlanning) {
        const mockPlan = buildMockAgentPlanRequest(agent, {
          tick: currentTick,
          speedMps: Number(now.speed.toFixed(1)),
          position: [now.x, 0.4, now.z],
          intent: agent.intent,
        })
        const keyState = agent.apiKey ? 'key:set' : 'key:missing'
        state[agent.id].visual.thought = `${agent.thought} [api-plan:${mockPlan.body.model} ${keyState}]`
      }
    }
    return state
  }, [runtimeAgents, currentTick])
  const mergedAgentStates = useMemo(
    () => ({
      ...visibleAgentStates,
      ...Object.fromEntries(Object.entries(runtimeAgentStates).map(([id, data]) => [id, data.visual])),
    }),
    [visibleAgentStates, runtimeAgentStates],
  )
  const handleTickChange = useCallback((tick: number) => {
    setCurrentTick(tick)
    setIsReplayPlaying(false)
  }, [])
  const handleReplayToggle = useCallback(() => {
    setIsReplayPlaying((playing) => !playing)
  }, [])
  const handleReplayReset = useCallback(() => {
    setCurrentTick(0)
    setIsReplayPlaying(false)
  }, [])
  const handleStepTick = useCallback(
    (delta: number) => {
      setCurrentTick((tick) => Math.max(0, Math.min(maxTick, tick + delta)))
      setIsReplayPlaying(false)
    },
    [maxTick],
  )
  useEffect(() => {
    if (!isReplayPlaying) return
    const timer = window.setInterval(() => {
      setCurrentTick((tick) => {
        if (tick >= maxTick) {
          window.clearInterval(timer)
          setIsReplayPlaying(false)
          return maxTick
        }
        return tick + 1
      })
    }, 650)
    return () => window.clearInterval(timer)
  }, [isReplayPlaying, maxTick])
  const agentTrails = useMemo(() => {
    const trails: Record<string, Vec3Tuple[]> = {}
    for (const event of visibleLogs) {
      if (event.tick > currentTick || event.type !== 'ACTION' || !Array.isArray(event.payload.position)) continue
      const pos = event.payload.position as Vec3Tuple
      if (!trails[event.agent_id]) trails[event.agent_id] = []
      trails[event.agent_id].push(pos)
    }
    return trails
  }, [visibleLogs, currentTick])
  const visibleAgentDirections = useMemo(() => {
    const perAgent: Record<string, Vec3Tuple> = {}
    const recentPositions: Record<string, Vec3Tuple[]> = {}
    for (const event of visibleLogs) {
      if (event.tick > currentTick || !Array.isArray(event.payload.position)) continue
      const pos = event.payload.position as Vec3Tuple
      if (!recentPositions[event.agent_id]) recentPositions[event.agent_id] = []
      recentPositions[event.agent_id].push(pos)
      if (recentPositions[event.agent_id].length > 3) recentPositions[event.agent_id].shift()
    }
    for (const [agentId, points] of Object.entries(recentPositions)) {
      if (points.length < 2) {
        perAgent[agentId] = [1, 0, 0]
        continue
      }
      const start = points[points.length - 2]
      const end = points[points.length - 1]
      const dx = end[0] - start[0]
      const dz = end[2] - start[2]
      const mag = Math.hypot(dx, dz)
      perAgent[agentId] = mag > 0.0001 ? [dx / mag, 0, dz / mag] : [1, 0, 0]
    }
    return perAgent
  }, [visibleLogs, currentTick])
  const verifyIntegrity = useCallback(async (): Promise<boolean> => {
    setIsVerifyingIntegrity(true)
    setVerifyProgress(0)
    try {
      return await verifyLogChainInBatches(logs, undefined, setVerifyProgress)
    } finally {
      setIsVerifyingIntegrity(false)
    }
  }, [logs])
  const handleAddAgent = useCallback(
    (draft: CustomAgentDraft): { ok: boolean; message: string } => {
      const id = draft.id.trim()
      if (!id) return { ok: false, message: 'Agent ID is required.' }
      const existingLogIds = new Set(logs.map((event) => event.agent_id))
      const existingRuntimeIds = new Set(runtimeAgents.map((agent) => agent.id))
      if (existingLogIds.has(id) || existingRuntimeIds.has(id)) {
        return { ok: false, message: `Agent "${id}" already exists.` }
      }
      const normalized: RuntimeAgent = {
        ...draft,
        id,
        intent: draft.intent.trim() || 'Patrol',
        thought: draft.thought.trim() || 'Monitoring lane and maintaining policy.',
        behaviorNotes: draft.behaviorNotes.trim() || 'No custom notes.',
        speedMps: Number.isFinite(draft.speedMps) ? Math.max(0.5, draft.speedMps) : 4,
        createdAtTick: currentTick,
      }
      setRuntimeAgents((prev) => [...prev, normalized])
      const apiHint = normalized.enableApiPlanning
        ? ` API mock enabled (${normalized.apiProvider}/${normalized.apiModel}).`
        : ''
      return { ok: true, message: `Agent "${id}" added with ${normalized.behavior} behavior.${apiHint}` }
    },
    [logs, runtimeAgents, currentTick],
  )

  useEffect(() => {
    const runDiag = async () => {
      const lines: string[] = []
      lines.push(`secure: ${window.isSecureContext}`)
      lines.push(`xr: ${'xr' in navigator && !!navigator.xr}`)
      if ('xr' in navigator && navigator.xr) {
        try {
          lines.push(`vr: ${await navigator.xr.isSessionSupported('immersive-vr')}`)
        } catch (e) {
          lines.push(`vr: err(${e})`)
        }
        try {
          lines.push(`ar: ${await navigator.xr.isSessionSupported('immersive-ar')}`)
        } catch (e) {
          lines.push(`ar: err(${e})`)
        }
        try {
          lines.push(`inline: ${await navigator.xr.isSessionSupported('inline')}`)
        } catch (e) {
          lines.push(`inline: err(${e})`)
        }
      }
      lines.push(`ua: ${navigator.userAgent.slice(0, 80)}`)
      setXrDiagText(lines.join(' | '))
    }
    runDiag()
  }, [])

  const handleEnterVR = async (): Promise<void> => {
    try {
      if (!window.isSecureContext) {
        setXrActionText('XR blocked: page is not in a secure context (use HTTPS / localhost).')
        return
      }
      if (!('xr' in navigator) || !navigator.xr) {
        setXrActionText('XR unavailable: this browser/device does not expose navigator.xr.')
        return
      }
      const vrSupported = await navigator.xr.isSessionSupported('immersive-vr')
      if (!vrSupported) {
        const arSupported = await navigator.xr.isSessionSupported('immersive-ar')
        if (!arSupported) {
          setXrActionText(
            'XR unavailable: immersive-vr and immersive-ar are not supported in this browser context.',
          )
          return
        }
        setXrActionText('VR not available here. Falling back to immersive-ar...')
        await xrStore.enterXR('immersive-ar')
        setXrActionText('XR session started in AR mode.')
        return
      }
      setXrActionText('XR: requesting immersive-vr session...')
      await xrStore.enterXR('immersive-vr')
      setXrActionText('XR session started. If nothing changes, accept browser/headset permission prompts.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setXrActionText(`XR failed: ${message}`)
    }
  }
  const worldConfig = SCENARIOS[scenario]
  const perf = useMemo(() => {
    if (performanceMode === 'low') {
      return {
        dpr: 0.8,
        shadows: false,
        showSky: false,
        showGrid: true,
        showTrails: false,
        showInteractionLinks: false,
        showContactShadows: false,
        showEnvironment: false,
      }
    }
    if (performanceMode === 'high') {
      return {
        dpr: 1.4,
        shadows: true,
        showSky: true,
        showGrid: true,
        showTrails: true,
        showInteractionLinks: true,
        showContactShadows: true,
        showEnvironment: true,
      }
    }
    return {
      dpr: 1,
      shadows: false,
      showSky: true,
      showGrid: true,
      showTrails: true,
      showInteractionLinks: true,
      showContactShadows: false,
      showEnvironment: false,
    }
  }, [performanceMode])
  return (
    <>
      <MissionControlHUD
        logs={visibleLogs}
        currentTick={currentTick}
        maxTick={maxTick}
        isXRPresenting={isXRPresenting}
        onTickChange={handleTickChange}
        isReplayPlaying={isReplayPlaying}
        onReplayToggle={handleReplayToggle}
        onReplayReset={handleReplayReset}
        isVerifyingIntegrity={isVerifyingIntegrity}
        verifyProgress={verifyProgress}
        onVerifyIntegrity={verifyIntegrity}
        onEnterVR={handleEnterVR}
        onAddAgent={handleAddAgent}
        onFocusAgent={setFocusedAgentId}
        scenario={scenario}
        onScenarioChange={setScenario}
        agentStates={mergedAgentStates}
        visibleAgentIds={visibleAgentIds}
        performanceMode={performanceMode}
        onPerformanceModeChange={setPerformanceMode}
        xrStatusText={[xrDiagText, xrActionText].filter(Boolean).join('\n')}
      />

      <Canvas
        dpr={perf.dpr}
        shadows={perf.shadows}
        gl={{ antialias: performanceMode !== 'low', powerPreference: 'high-performance' }}
        camera={{ position: [7.8, 7.2, 8.6], fov: 45 }}
      >
        <XR store={xrStore}>
          <PlayerRig onStepTick={handleStepTick} onXRPresentingChange={setIsXRPresenting} />
          <color attach="background" args={[worldConfig.sky]} />
          <fog attach="fog" args={[worldConfig.sky, 20, 55]} />
          {perf.showSky && (
            <Sky distance={450000} sunPosition={[8, 10, 5]} inclination={0.25} azimuth={0.2} />
          )}
          <ambientLight intensity={performanceMode === 'low' ? 0.95 : 0.78} />
          <hemisphereLight args={['#dbeafe', '#9ca3af', performanceMode === 'low' ? 0.95 : 0.8]} />
          <directionalLight
            position={[8, 12, 6]}
            intensity={1.15}
            castShadow={perf.shadows}
            shadow-mapSize-width={perf.shadows ? 2048 : 1024}
            shadow-mapSize-height={perf.shadows ? 2048 : 1024}
          />
          <pointLight position={[0, 5, 0]} intensity={performanceMode === 'low' ? 0.08 : 0.18} color="#f8fafc" />

          {perf.showGrid && (
            <Grid position={[0, 0.01, 0]} args={[30, 30]} cellColor="#cbd5e1" sectionColor="#94a3b8" fadeDistance={40} fadeStrength={1} cellSize={1.2} sectionSize={6} />
          )}

          {worldConfig.laneGuides.map((line, index) => (
            <Line key={`lane-${index}`} points={line} color="#f8fafc" lineWidth={1.5} transparent opacity={0.28} />
          ))}
          {worldConfig.dashedMarks.map((mark, index) => (
            <Line key={`dash-${index}`} points={mark} color="#f8fafc" lineWidth={2} transparent opacity={0.72} />
          ))}

          <WorldGeometry scenario={scenario} />
          {worldConfig.crosswalks.map((crosswalk, index) => (
            <Crosswalk key={`crosswalk-${index}`} position={crosswalk.position} rotationY={crosswalk.rotationY} />
          ))}
          {worldConfig.arrows.map((arrow, index) => (
            <LaneArrow key={`arrow-${index}`} position={arrow.position} rotationY={arrow.rotationY} />
          ))}
          <TrafficLights tick={currentTick} scenario={scenario} />

          {perf.showTrails &&
            Object.entries(agentTrails).map(([agentId, points], index) =>
              points.length > 1 ? (
                <Line key={`trail-${agentId}`} points={points} color={index % 2 === 0 ? '#38bdf8' : '#a78bfa'} lineWidth={2.2} transparent opacity={0.85} />
              ) : null,
            )}

          {Object.entries(visibleAgentStates).map(([agentId, state], index) => (
            <SpatialAgent
              key={agentId}
              id={agentId}
              position={state.position}
              thought={state.thought}
              direction={visibleAgentDirections[agentId] ?? [1, 0, 0]}
              intent={state.intent}
              speedMps={state.speed_mps}
              seeing={state.seeing}
              color={index % 2 === 0 ? '#7dd3fc' : '#a78bfa'}
              focused={focusedAgentId === agentId}
              renderBody
            />
          ))}
          {Object.entries(runtimeAgentStates).map(([agentId, state]) => (
            <SpatialAgent
              key={agentId}
              id={agentId}
              position={state.visual.position}
              thought={state.visual.thought}
              direction={state.direction}
              intent={state.visual.intent}
              speedMps={state.visual.speed_mps}
              seeing={state.visual.seeing}
              color={state.color}
              focused={focusedAgentId === agentId}
              renderBody
            />
          ))}

          {perf.showInteractionLinks &&
            interactions.map((interaction) => {
              const fromState = visibleAgentStates[interaction.from]
              const toState = visibleAgentStates[interaction.to]
              if (!fromState || !toState) return null
              const p1: Vec3Tuple = [fromState.position[0], fromState.position[1] + 0.16, fromState.position[2]]
              const p2: Vec3Tuple = [toState.position[0], toState.position[1] + 0.16, toState.position[2]]
              const mid: Vec3Tuple = [(p1[0] + p2[0]) / 2, Math.max(p1[1], p2[1]) + 0.2, (p1[2] + p2[2]) / 2]
              return (
                <group key={`${interaction.from}-${interaction.to}-${interaction.label}`}>
                  <Line points={[p1, p2]} color="#22d3ee" lineWidth={2.6} transparent opacity={0.95} />
                  <Text position={mid} fontSize={0.14} color="#67e8f9" anchorX="center" anchorY="middle" outlineColor="#020617" outlineWidth={0.015}>
                    {interaction.label}
                  </Text>
                </group>
              )
            })}

          {perf.showContactShadows && (
            <ContactShadows position={[0, 0.01, 0]} opacity={0.42} scale={28} blur={1.8} far={15} />
          )}
          {perf.showEnvironment && <Environment preset="city" />}
          <OrbitControls makeDefault maxPolarAngle={Math.PI * 0.48} minDistance={6} maxDistance={22} target={[0, 0.8, 0]} />
        </XR>
      </Canvas>
    </>
  )
}

export default App
