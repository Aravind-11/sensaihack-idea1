import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Line, OrbitControls, Sky, Text } from '@react-three/drei'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { buildDemoLogChain, type ScenarioId, verifyLogChain } from './audit/clientLog'
import { buildAgentStateAtTick, getInteractionsAtTick, getMaxTick } from './audit/replay'
import { MissionControlHUD } from './components/MissionControl'
import { SpatialAgent } from './components/SpatialAgent'
import type { AgentInteraction, AuditEvent, Vec3Tuple } from './types/audit'
import { Vector3, type Group } from 'three'

const xrStore = createXRStore({
  emulate: false,
  offerSession: false,
})
const MAX_HUD_AGENTS = 4
type PerformanceMode = 'low' | 'medium' | 'high'

type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number }
type ScenarioConfig = {
  laneGuides: Vec3Tuple[][]
  dashedMarks: Vec3Tuple[][]
  crosswalks: Array<{ position: Vec3Tuple; rotationY?: number }>
  minimapBounds: MinimapBounds
  sky: string
}

const cityLaneGuides: Vec3Tuple[][] = []

const cityDashedMarks: Vec3Tuple[][] = [
]

const highwayLaneGuides: Vec3Tuple[][] = [
]

const highwayDashedMarks: Vec3Tuple[][] = [
  [[-25, 0.04, 0], [-23.8, 0.04, 0]],
  [[-22.4, 0.04, 0], [-21.2, 0.04, 0]],
  [[-19.8, 0.04, 0], [-18.6, 0.04, 0]],
  [[-17.2, 0.04, 0], [-16, 0.04, 0]],
  [[-14.6, 0.04, 0], [-13.4, 0.04, 0]],
  [[-12, 0.04, 0], [-10.8, 0.04, 0]],
  [[-9.4, 0.04, 0], [-8.2, 0.04, 0]],
  [[-6.8, 0.04, 0], [-5.6, 0.04, 0]],
  [[-4.2, 0.04, 0], [-3, 0.04, 0]],
  [[-1.6, 0.04, 0], [-0.4, 0.04, 0]],
  [[1, 0.04, 0], [2.2, 0.04, 0]],
  [[3.6, 0.04, 0], [4.8, 0.04, 0]],
  [[6.2, 0.04, 0], [7.4, 0.04, 0]],
  [[8.8, 0.04, 0], [10, 0.04, 0]],
  [[11.4, 0.04, 0], [12.6, 0.04, 0]],
  [[14, 0.04, 0], [15.2, 0.04, 0]],
  [[16.6, 0.04, 0], [17.8, 0.04, 0]],
  [[19.2, 0.04, 0], [20.4, 0.04, 0]],
  [[21.8, 0.04, 0], [23, 0.04, 0]],
  [[24.4, 0.04, 0], [25.6, 0.04, 0]],
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
    minimapBounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 },
    sky: '#cfe8ff',
  },
  highway: {
    laneGuides: highwayLaneGuides,
    dashedMarks: highwayDashedMarks,
    crosswalks: [],
    minimapBounds: { minX: -24, maxX: 24, minZ: -6, maxZ: 6 },
    sky: '#dbeafe',
  },
}

const forwardVector = new Vector3()
const rightVector = new Vector3()
const movementDelta = new Vector3()
const KEYBOARD_DEADZONE = 0.01
const CONTROLLER_DEADZONE = 0.18
const TURN_INPUT_DEADZONE = 0.65
const SNAP_TURN_RADIANS = Math.PI / 8

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

/**
 * Handles the logic and rendering of the traffic lights based on the current scenario and time (tick).
 */
function TrafficLights({ tick, scenario }: { tick: number; scenario: ScenarioId }) {
  const getColor = (active: boolean, base: string): string => (active ? base : '#111827')

  const lightPositions: Vec3Tuple[] =
    scenario === 'city-merge'
      ? [[-2.8, 1.2, -2.8], [2.8, 1.2, -2.8], [2.8, 1.2, 2.8], [-2.8, 1.2, 2.8]]
      : [] // No traffic lights for highway or other scenarios

  return (
    <group>
      {lightPositions.map((pos, index) => {
        // Offset the tick by index so they change independently
        const cycle = Math.floor((tick - 1 + index * 2) / 2) % 3
        const current = cycle === 0 ? 'red' : cycle === 1 ? 'green' : 'yellow'

        // Rotate 90 degrees (PI/2) for each index
        const rotationY = (index + 2) * (-Math.PI / 2)
        return (
          <group key={`tl-${index}`} position={pos} rotation={[0, rotationY, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.15, 2.4, 0.15]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, 0.8, 0]}>
              <boxGeometry args={[0.25, 0.95, 0.25]} />
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
                color={getColor(current === 'green', '#22c55e')}
                emissive={getColor(current === 'green', '#22c55e')}
                emissiveIntensity={0.65}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/**
 * Renders a crosswalk marking on the ground based on a given position and rotation.
 */
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

/**
 * Conditionally renders the overall structural geometry, environment blockouts, and details 
 * based on the selected ScenarioId.
 */
function WorldGeometry({ scenario }: { scenario: ScenarioId }) {
  if (scenario === 'highway') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 30]} />
          <meshStandardMaterial color="#145e18" roughness={1} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[56, 4.6]} />
          <meshStandardMaterial color="#0b1220" roughness={0.96} />
        </mesh>
        <mesh position={[0, 0.08, -2.3]} receiveShadow>
          <boxGeometry args={[56, 0.18, 0.22]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 0.08, 2.3]} receiveShadow>
          <boxGeometry args={[56, 0.18, 0.22]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>
    )
  }

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
        <planeGeometry args={[24, 3.6]} />
        <meshStandardMaterial color="#303640" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.6, 24]} />
        <meshStandardMaterial color="#303640" roughness={0.98} />
      </mesh>
      <mesh position={[8, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 0.1]} />
        <meshStandardMaterial color="#edac1f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.031, 8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.1, 6]} />
        <meshStandardMaterial color="#edac1f" roughness={0.9} />
      </mesh>
      <mesh position={[-8, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 0.1]} />
        <meshStandardMaterial color="#edac1f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.031, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.1, 6]} />
        <meshStandardMaterial color="#edac1f" roughness={0.9} />
      </mesh>
    </group>
  )
}

/**
 * The primary application component. Orchestrates the 3D scene, UI HUD, agent log replays,
 * scenario swapping, and XR integration.
 */
function App() {
  const [logs, setLogs] = useState<AuditEvent[]>([])
  const [currentTick, setCurrentTick] = useState(0)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const [isXRPresenting, setIsXRPresenting] = useState(false)
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [scenario, setScenario] = useState<ScenarioId>('city-merge')
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('medium')
  const [xrDiagText, setXrDiagText] = useState('')
  const [xrActionText, setXrActionText] = useState('')

  useEffect(() => {
    let active = true
    buildDemoLogChain(scenario).then((chain) => {
      if (!active) return
      setLogs(chain)
      setCurrentTick(getMaxTick(chain))
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
  const verifyIntegrity = async (): Promise<boolean> => verifyLogChain(logs)

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
      showGrid: false,
      showTrails: false,
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
        onVerifyIntegrity={verifyIntegrity}
        onEnterVR={handleEnterVR}
        onFocusAgent={setFocusedAgentId}
        scenario={scenario}
        onScenarioChange={setScenario}
        agentStates={visibleAgentStates}
        minimapBounds={worldConfig.minimapBounds}
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
              intent={state.intent}
              speedMps={state.speed_mps}
              seeing={state.seeing}
              color={index % 2 === 0 ? '#7dd3fc' : '#a78bfa'}
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
