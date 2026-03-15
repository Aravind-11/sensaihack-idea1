import { useEffect, useMemo, useState } from 'react'
import { withSpatialized2DElementContainer } from '@webspatial/react-sdk'
import { buildAIAuditDiagnosis } from '../audit/diagnostics'
import type { ScenarioId } from '../audit/clientLog'
import type { AgentVisualState } from '../types/audit'
import type { AuditEvent } from '../types/audit'

export type AgentBehaviorProfile = 'cautious' | 'assertive' | 'cooperative' | 'custom'

export interface CustomAgentDraft {
  id: string
  color: string
  position: [number, number, number]
  speedMps: number
  intent: string
  thought: string
  behavior: AgentBehaviorProfile
  behaviorNotes: string
  enableApiPlanning: boolean
  apiProvider: string
  apiModel: string
  apiKey: string
}

type AddAgentResult = {
  ok: boolean
  message: string
}

type MissionControlHUDProps = {
  logs: AuditEvent[]
  currentTick: number
  maxTick: number
  isXRPresenting: boolean
  onTickChange: (tick: number) => void
  isReplayPlaying: boolean
  onReplayToggle: () => void
  onReplayReset: () => void
  isVerifyingIntegrity: boolean
  verifyProgress: number
  onVerifyIntegrity: () => Promise<boolean>
  onEnterVR: () => Promise<void> | void
  onAddAgent: (draft: CustomAgentDraft) => AddAgentResult
  onFocusAgent: (agentId: string | null) => void
  scenario: ScenarioId
  onScenarioChange: (scenario: ScenarioId) => void
  agentStates: Record<string, AgentVisualState>
  visibleAgentIds: string[]
  performanceMode: 'low' | 'medium' | 'high'
  onPerformanceModeChange: (mode: 'low' | 'medium' | 'high') => void
  xrStatusText: string
}

type VerifyState = 'idle' | 'pass' | 'fail'
type DockMode = 'dock' | 'follow'

const basePanelStyle: React.CSSProperties = {
  width: 350,
  maxHeight: '88vh',
  borderRadius: 16,
  border: '1px solid #1f4f78',
  background: 'linear-gradient(180deg, rgba(5, 15, 33, 0.96) 0%, rgba(3, 10, 24, 0.95) 100%)',
  color: '#c3e8ff',
  backdropFilter: 'blur(12px)',
  padding: 14,
  fontFamily: 'Inter, system-ui, sans-serif',
  pointerEvents: 'auto',
  boxShadow:
    '0 12px 28px rgba(0, 0, 0, 0.45), 0 0 16px rgba(34, 211, 238, 0.15), inset 0 0 0 1px rgba(56, 189, 248, 0.16)',
  overflowY: 'auto',
}

const getBorderColor = (verifyState: VerifyState): string => {
  if (verifyState === 'pass') return '#34d399'
  if (verifyState === 'fail') return '#fb7185'
  return '#1f4f78'
}

const hudButtonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #265b87',
  background: 'linear-gradient(180deg, #0b1b34 0%, #09172c 100%)',
  color: '#9fd9ff',
  boxShadow: 'inset 0 0 0 1px rgba(34, 211, 238, 0.08)',
}

const hudSelectStyle: React.CSSProperties = {
  background: '#071428',
  color: '#9fd9ff',
  border: '1px solid #265b87',
  borderRadius: 8,
  fontSize: 12,
  padding: '4px 8px',
}

const typeColorMap: Record<'OBSERVE' | 'THINK' | 'ACTION', string> = {
  ACTION: '#3af6a6',
  OBSERVE: '#43d8ff',
  THINK: '#facc15',
}

export function MissionControlHUD({
  logs,
  currentTick,
  maxTick,
  isXRPresenting,
  onTickChange,
  isReplayPlaying,
  onReplayToggle,
  onReplayReset,
  isVerifyingIntegrity,
  verifyProgress,
  onVerifyIntegrity,
  onEnterVR,
  onAddAgent,
  onFocusAgent,
  scenario,
  onScenarioChange,
  agentStates,
  visibleAgentIds,
  performanceMode,
  onPerformanceModeChange,
  xrStatusText,
}: MissionControlHUDProps) {
  const SpatialDiv = useMemo(() => withSpatialized2DElementContainer('div'), [])
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [dockMode, setDockMode] = useState<DockMode>('dock')
  const [selectedLogHash, setSelectedLogHash] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [showAddAgentForm, setShowAddAgentForm] = useState(false)
  const [addAgentStatus, setAddAgentStatus] = useState('')
  const [newAgent, setNewAgent] = useState<CustomAgentDraft>({
    id: 'car-epsilon',
    color: '#f472b6',
    position: [1.6, 0.4, -3.4],
    speedMps: 9.2,
    intent: 'Patrol',
    thought: 'Joining mission with local lane policy.',
    behavior: 'cooperative',
    behaviorNotes: 'Maintain safe spacing and cooperate on merges.',
    enableApiPlanning: false,
    apiProvider: 'openai',
    apiModel: 'gpt-4o-mini',
    apiKey: '',
  })

  const visibleLogs = logs.filter(
    (log) => log.tick <= currentTick && (!selectedAgentId || log.agent_id === selectedAgentId),
  )
  const diagnosis = useMemo(
    () => buildAIAuditDiagnosis(logs, currentTick, visibleAgentIds),
    [logs, currentTick, visibleAgentIds],
  )
  const selectedAgentState = selectedAgentId ? agentStates[selectedAgentId] : null
  const selectedLog = visibleLogs.find((log) => log.hash === selectedLogHash) ?? visibleLogs.at(-1) ?? null
  const selectedLoopPerception =
    typeof selectedLog?.payload.loop_perception === 'string'
      ? selectedLog.payload.loop_perception
      : `intent=${selectedLog?.payload.intent ?? 'unknown'}; speed=${selectedLog?.payload.speed_mps ?? 'n/a'}`
  const selectedLoopDecision =
    typeof selectedLog?.payload.loop_decision === 'string'
      ? selectedLog.payload.loop_decision
      : typeof selectedLog?.payload.decision === 'string'
        ? selectedLog.payload.decision
        : `Follow ${selectedLog?.type ?? 'UNKNOWN'} policy`
  const selectedLoopAction =
    typeof selectedLog?.payload.loop_action === 'string'
      ? selectedLog.payload.loop_action
      : `${selectedLog?.type ?? 'UNKNOWN'} -> ${selectedLog?.payload.interaction ?? 'state-update'}`
  const selectedLoopPolicy =
    typeof selectedLog?.payload.loop_policy === 'string' ? selectedLog.payload.loop_policy : 'policy.default'
  const selectedLoopRisk =
    typeof selectedLog?.payload.loop_risk === 'number' ? selectedLog.payload.loop_risk : selectedLog?.payload.confidence

  useEffect(() => {
    if (!selectedAgentId && visibleAgentIds.length > 0) {
      setSelectedAgentId(visibleAgentIds[0])
    } else if (selectedAgentId && !visibleAgentIds.includes(selectedAgentId)) {
      setSelectedAgentId(visibleAgentIds[0] ?? null)
    }
  }, [selectedAgentId, visibleAgentIds])

  useEffect(() => {
    if (!selectedLogHash && visibleLogs.length > 0) {
      setSelectedLogHash(visibleLogs[visibleLogs.length - 1].hash)
      return
    }
    if (selectedLogHash && !visibleLogs.some((log) => log.hash === selectedLogHash)) {
      setSelectedLogHash(visibleLogs.at(-1)?.hash ?? null)
    }
  }, [visibleLogs, selectedLogHash])

  useEffect(() => {
    onFocusAgent(selectedLog?.agent_id ?? null)
  }, [selectedLog, onFocusAgent])
  useEffect(() => {
    if (isXRPresenting) setDockMode('dock')
  }, [isXRPresenting])

  const wrapperStyle: React.CSSProperties =
    dockMode === 'follow'
      ? {
          position: 'fixed',
          left: '50%',
          top: '8%',
          transform: 'translateX(-50%) translateZ(120px)',
          zIndex: 10,
        }
      : {
          position: 'fixed',
          right: isXRPresenting ? 6 : 12,
          top: isXRPresenting ? 6 : 12,
          zIndex: 10,
          transform: isXRPresenting ? 'translateZ(45px)' : 'translateZ(80px)',
        }

  const handleVerifyClick = async () => {
    const isValid = await onVerifyIntegrity()
    setVerifyState(isValid ? 'pass' : 'fail')
    if (!isValid) {
      alert('Audit log integrity failed: chain has been tampered with.')
    }
  }
  const updateNewAgent = <K extends keyof CustomAgentDraft>(key: K, value: CustomAgentDraft[K]) => {
    setNewAgent((prev) => ({ ...prev, [key]: value }))
  }
  const handleAddAgentSubmit = () => {
    const result = onAddAgent(newAgent)
    setAddAgentStatus(result.message)
    if (!result.ok) return
    setNewAgent((prev) => ({
      ...prev,
      id: `${prev.id}-next`,
      position: [prev.position[0] + 0.8, prev.position[1], prev.position[2] + 0.4],
    }))
  }

  return (
    <SpatialDiv component="div" style={wrapperStyle}>
      <div
        style={{
          ...basePanelStyle,
          width: isXRPresenting ? 286 : basePanelStyle.width,
          maxHeight: isXRPresenting ? '70vh' : basePanelStyle.maxHeight,
          padding: isXRPresenting ? 10 : basePanelStyle.padding,
          borderColor: getBorderColor(verifyState),
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 24, letterSpacing: 0.3, color: '#2dd4ff', textShadow: '0 0 12px rgba(45, 212, 255, 0.25)' }}>
            Mission Control HUD
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={hudButtonStyle} onClick={() => setDockMode(dockMode === 'dock' ? 'follow' : 'dock')}>
              {dockMode === 'dock' ? 'Follow User' : 'Dock HUD'}
            </button>
            {isXRPresenting && (
              <button style={hudButtonStyle} onClick={() => setShowAddAgentForm((open) => !open)}>
                {showAddAgentForm ? 'Hide Agent' : 'Create Agent'}
              </button>
            )}
          </div>
        </div>

        <p style={{ margin: '8px 0 10px', fontSize: 12, color: '#6e8fb3' }}>
          WebXR note: test from the PICO Browser via `npm run dev -- --host`.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button style={hudButtonStyle} onClick={() => void onEnterVR()}>
            Enter VR
          </button>
          <button style={hudButtonStyle} onClick={handleVerifyClick} disabled={isVerifyingIntegrity}>
            {isVerifyingIntegrity ? `Verifying ${Math.round(verifyProgress * 100)}%` : 'Verify Integrity'}
          </button>
          <span
            style={{
              fontSize: 12,
              alignSelf: 'center',
              color: '#9fd9ff',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 999,
              padding: '3px 8px',
              background: 'rgba(8, 22, 42, 0.72)',
            }}
          >
            {verifyState === 'idle' ? 'Not verified' : verifyState === 'pass' ? 'Verified OK' : 'Verification failed'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#86cfff', marginBottom: 10, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {xrStatusText}
        </div>
        {isVerifyingIntegrity && (
          <div style={{ fontSize: 11, color: '#7dd3fc', marginBottom: 10 }}>
            Background chain verification running... {Math.round(verifyProgress * 100)}%
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#7ec8ff' }}>
          Replay Scrubber (tick: {currentTick}/{maxTick})
        </label>
        <input
          type="range"
          min={0}
          max={maxTick}
          value={currentTick}
          onChange={(event) => onTickChange(Number(event.target.value))}
          style={{ width: '100%', marginBottom: 12, accentColor: '#21d4fd' }}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button style={hudButtonStyle} onClick={onReplayToggle}>
            {isReplayPlaying ? 'Pause Replay' : 'Play Replay'}
          </button>
          <button style={hudButtonStyle} onClick={onReplayReset}>
            Reset Replay
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#7ec8ff' }}>Scenario</label>
          <select
            value={scenario}
            onChange={(event) => onScenarioChange(event.target.value as ScenarioId)}
            style={hudSelectStyle}
          >
            <option value="city-merge">City Merge</option>
            <option value="highway">Highway</option>
            <option value="roundabout">Roundabout</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button style={hudButtonStyle} onClick={() => setShowAddAgentForm((open) => !open)}>
            {showAddAgentForm ? 'Close Agent Form' : 'Create Agent'}
          </button>
          {addAgentStatus && <span style={{ fontSize: 11, color: '#93c5fd' }}>{addAgentStatus}</span>}
        </div>
        {showAddAgentForm && (
          <div
            style={{
              marginBottom: 12,
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 8,
              padding: 8,
              background: 'rgba(6, 20, 40, 0.72)',
              display: 'grid',
              gap: 6,
            }}
          >
            <label style={{ fontSize: 11, color: '#9fd9ff' }}>
              Agent ID
              <input
                value={newAgent.id}
                onChange={(event) => updateNewAgent('id', event.target.value)}
                style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                Color
                <input
                  value={newAgent.color}
                  onChange={(event) => updateNewAgent('color', event.target.value)}
                  style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                />
              </label>
              <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                Speed (m/s)
                <input
                  type="number"
                  value={newAgent.speedMps}
                  onChange={(event) => updateNewAgent('speedMps', Number(event.target.value))}
                  style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                Start X
                <input
                  type="number"
                  value={newAgent.position[0]}
                  onChange={(event) =>
                    updateNewAgent('position', [
                      Number(event.target.value),
                      newAgent.position[1],
                      newAgent.position[2],
                    ])
                  }
                  style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                />
              </label>
              <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                Start Z
                <input
                  type="number"
                  value={newAgent.position[2]}
                  onChange={(event) =>
                    updateNewAgent('position', [
                      newAgent.position[0],
                      newAgent.position[1],
                      Number(event.target.value),
                    ])
                  }
                  style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                />
              </label>
            </div>
            <label style={{ fontSize: 11, color: '#9fd9ff' }}>
              Intent
              <input
                value={newAgent.intent}
                onChange={(event) => updateNewAgent('intent', event.target.value)}
                style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
              />
            </label>
            <label style={{ fontSize: 11, color: '#9fd9ff' }}>
              Thought
              <input
                value={newAgent.thought}
                onChange={(event) => updateNewAgent('thought', event.target.value)}
                style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
              />
            </label>
            <label style={{ fontSize: 11, color: '#9fd9ff' }}>
              Behavior Profile
              <select
                value={newAgent.behavior}
                onChange={(event) => updateNewAgent('behavior', event.target.value as AgentBehaviorProfile)}
                style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
              >
                <option value="cautious">Cautious</option>
                <option value="assertive">Assertive</option>
                <option value="cooperative">Cooperative</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label style={{ fontSize: 11, color: '#9fd9ff' }}>
              Behavior Notes
              <textarea
                value={newAgent.behaviorNotes}
                onChange={(event) => updateNewAgent('behaviorNotes', event.target.value)}
                style={{ width: '100%', marginTop: 4, minHeight: 58, ...hudSelectStyle }}
              />
            </label>
            <label style={{ fontSize: 11, color: '#9fd9ff', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={newAgent.enableApiPlanning}
                onChange={(event) => updateNewAgent('enableApiPlanning', event.target.checked)}
              />
              Enable API planning metadata (mock request only)
            </label>
            {newAgent.enableApiPlanning && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                    API Provider
                    <input
                      value={newAgent.apiProvider}
                      onChange={(event) => updateNewAgent('apiProvider', event.target.value)}
                      style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                    />
                  </label>
                  <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                    API Model
                    <input
                      value={newAgent.apiModel}
                      onChange={(event) => updateNewAgent('apiModel', event.target.value)}
                      style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                    />
                  </label>
                </div>
                <label style={{ fontSize: 11, color: '#9fd9ff' }}>
                  API Key
                  <input
                    type="password"
                    value={newAgent.apiKey}
                    placeholder="sk-... (stored locally for this session)"
                    onChange={(event) => updateNewAgent('apiKey', event.target.value)}
                    style={{ width: '100%', marginTop: 4, ...hudSelectStyle }}
                  />
                </label>
              </>
            )}
            <button style={hudButtonStyle} onClick={handleAddAgentSubmit}>
              Create Agent
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#7ec8ff' }}>Performance</label>
          <select
            value={performanceMode}
            onChange={(event) =>
              onPerformanceModeChange(event.target.value as 'low' | 'medium' | 'high')
            }
            style={hudSelectStyle}
          >
            <option value="low">Low (headset-safe)</option>
            <option value="medium">Medium</option>
            <option value="high">High quality</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#7ec8ff' }}>Agents ({visibleAgentIds.length}/4)</label>
          <button
            onClick={() => setSelectedAgentId(null)}
            style={{ ...hudButtonStyle, fontSize: 11, padding: '3px 8px', opacity: selectedAgentId ? 0.85 : 1 }}
          >
            Show All
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {visibleAgentIds.map((agentId) => {
            const state = agentStates[agentId]
            return (
              <button
                key={agentId}
                onClick={() => setSelectedAgentId(agentId)}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderColor: selectedAgentId === agentId ? '#22d3ee' : '#265b87',
                  background:
                    selectedAgentId === agentId
                      ? 'linear-gradient(180deg, rgba(8, 47, 73, 0.88) 0%, rgba(6, 34, 57, 0.88) 100%)'
                      : '#071428',
                  color: '#bde6ff',
                }}
              >
                <div style={{ fontSize: 11, color: '#bde6ff' }}>{agentId}</div>
                <div style={{ fontSize: 10, color: '#5dd6ff' }}>
                  {state ? `${state.speed_mps.toFixed(1)} m/s` : 'No state'}
                </div>
              </button>
            )
          })}
        </div>

        <h4 style={{ margin: '10px 0 8px', fontSize: 13, letterSpacing: 0.3, color: '#7ec8ff' }}>
          Audit Logs (Chain of Thought)
        </h4>
        <div
          style={{
            maxHeight: 180,
            overflowY: 'auto',
            background: 'rgba(6, 20, 40, 0.65)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: 8,
            padding: 8,
            fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
          }}
        >
          {visibleLogs.map((log) => (
            <div
              key={log.hash}
              onClick={() => setSelectedLogHash(log.hash)}
              style={{
                fontSize: 12,
                lineHeight: 1.35,
                borderBottom: '1px dashed rgba(56, 189, 248, 0.22)',
                padding: '7px 2px',
                cursor: 'pointer',
                borderRadius: 6,
                background:
                  selectedLog?.hash === log.hash ? 'rgba(10, 54, 87, 0.65)' : 'transparent',
                color: '#b7e8a6',
              }}
            >
              <span style={{ color: '#5f6f8f', marginRight: 8 }}>#{log.tick}</span>
              <span style={{ color: typeColorMap[log.type], fontWeight: 700, marginRight: 8 }}>
                {log.type}
              </span>
              <span style={{ color: '#b7e8a6' }}>
                [{log.agent_id}] {String(log.payload.thought ?? '(no thought)')}
              </span>
            </div>
          ))}
          {visibleLogs.length === 0 && (
            <div style={{ fontSize: 12, color: '#6e8fb3' }}>Move the scrubber to view events.</div>
          )}
        </div>

        {selectedLog && (
          <div
            style={{
              marginTop: 10,
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 8,
              padding: 8,
              background: 'rgba(6, 20, 40, 0.65)',
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 6, color: '#9fd9ff' }}>
              Selected Event: <strong style={{ color: '#3ad8ff' }}>{selectedLog.agent_id}</strong> / T
              {selectedLog.tick} / {selectedLog.type}
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                lineHeight: 1.35,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: '#b7e8a6',
                maxHeight: 90,
                overflowY: 'auto',
                fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
              }}
            >
              {JSON.stringify(selectedLog.payload, null, 2)}
            </pre>
            <div
              style={{
                marginTop: 8,
                borderTop: '1px dashed rgba(56, 189, 248, 0.22)',
                paddingTop: 8,
                fontSize: 11,
                color: '#9fd9ff',
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontSize: 12, color: '#67e8f9', marginBottom: 4 }}>
                Agentic Loop: Perception - Decision - Action
              </div>
              <div>- Perception: {selectedLoopPerception}</div>
              <div>- Decision: {selectedLoopDecision}</div>
              <div>- Action: {selectedLoopAction}</div>
              <div>
                - Policy: {selectedLoopPolicy}
                {selectedLoopRisk !== undefined ? ` | risk=${selectedLoopRisk}` : ''}
              </div>
            </div>
          </div>
        )}

        {selectedAgentId && selectedAgentState && (
          <div
            style={{
              marginTop: 10,
              border: '1px solid rgba(34, 211, 238, 0.35)',
              borderRadius: 8,
              padding: 8,
              background: 'rgba(8, 39, 65, 0.45)',
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 6, color: '#79d6ff' }}>
              Interpretability: <strong>{selectedAgentId}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#c2e8ff', lineHeight: 1.4 }}>
              Intent: {selectedAgentState.intent}
              <br />
              Speed: {selectedAgentState.speed_mps.toFixed(1)} m/s
              <br />
              Sees: {selectedAgentState.seeing.length > 0 ? selectedAgentState.seeing.join(', ') : 'none'}
              <br />
              Thought: {selectedAgentState.thought}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 10,
              border: '1px solid rgba(45, 212, 255, 0.35)',
            borderRadius: 8,
            padding: 8,
              background: 'rgba(8, 25, 45, 0.62)',
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 6, color: '#7edbff' }}>AI Audit Diagnosis</div>
          {diagnosis.findings.map((finding, index) => (
            <div
              key={`finding-${index}`}
              style={{
                fontSize: 11,
                color:
                  finding.severity === 'critical'
                    ? '#ff9aa9'
                    : finding.severity === 'warning'
                      ? '#ffd277'
                      : '#8ecbff',
                marginBottom: 4,
              }}
            >
              - {finding.message}
            </div>
          ))}
          <div style={{ marginTop: 6, borderTop: '1px dashed rgba(56, 189, 248, 0.25)', paddingTop: 6 }}>
            {diagnosis.perAgent.map((summary) => (
              <div key={`diag-agent-${summary.agentId}`} style={{ fontSize: 10, color: '#93c5fd', marginBottom: 2 }}>
                {summary.agentId}: events={summary.eventCount}, conf=
                {summary.avgConfidence ?? 'n/a'}, maxSpeed={summary.maxSpeed.toFixed(1)}, lowConf=
                {summary.lowConfidenceEvents}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SpatialDiv>
  )
}
