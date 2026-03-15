import type { AuditEventPayload, AuditEventType } from '../types/audit'

export interface AgentLoopDraft {
  tick: number
  agent_id: string
  type: AuditEventType
  payload: AuditEventPayload
}

type AgentMemory = {
  lastIntent: string
  lastSpeed: number
  lastSeenCount: number
}

const DEFAULT_MEMORY: AgentMemory = {
  lastIntent: 'Hold lane',
  lastSpeed: 0,
  lastSeenCount: 0,
}

const safeNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const safeString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const getSeenCount = (value: unknown, fallback: number): number =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').length : fallback

const normalizeSpeedRisk = (speedMps: number): number => Math.min(1, Math.max(0, speedMps / 25))
const normalizeTrafficRisk = (seenCount: number): number => Math.min(1, seenCount / 4)

const choosePolicy = (intent: string, risk: number): string => {
  const lower = intent.toLowerCase()
  if (risk > 0.72) return 'policy.safety.decelerate_then_yield'
  if (lower.includes('merge') || lower.includes('overtake') || lower.includes('exit')) {
    return 'policy.coordination.gap_acceptance'
  }
  return 'policy.stability.maintain_headway'
}

const deriveDecision = (policy: string): string => {
  if (policy === 'policy.safety.decelerate_then_yield') return 'Reduce speed and preserve conflict-free envelope'
  if (policy === 'policy.coordination.gap_acceptance') return 'Cooperate with nearby agents and execute transition'
  return 'Maintain trajectory and nominal spacing'
}

const deriveActionSummary = (draft: AgentLoopDraft): string => {
  if (draft.type === 'ACTION') {
    const interaction = safeString(draft.payload.interaction, 'actuate')
    const target = safeString(draft.payload.target_agent, 'world')
    return `${interaction} -> ${target}`
  }
  if (draft.type === 'THINK') return 'update plan graph'
  return 'refresh world model'
}

export const enrichWithDecisionLoop = (
  draft: AgentLoopDraft,
  memory: AgentMemory = DEFAULT_MEMORY,
): { payload: AuditEventPayload; nextMemory: AgentMemory } => {
  const intent = safeString(draft.payload.intent, memory.lastIntent)
  const speedMps = safeNumber(draft.payload.speed_mps, memory.lastSpeed)
  const seenCount = getSeenCount(draft.payload.seeing, memory.lastSeenCount)
  const speedRisk = normalizeSpeedRisk(speedMps)
  const trafficRisk = normalizeTrafficRisk(seenCount)
  const eventRisk = draft.type === 'ACTION' ? 0.15 : draft.type === 'THINK' ? 0.08 : 0
  const riskScore = Number(Math.min(1, speedRisk * 0.5 + trafficRisk * 0.35 + eventRisk).toFixed(2))
  const policy = choosePolicy(intent, riskScore)
  const decision = deriveDecision(policy)
  const actionSummary = deriveActionSummary(draft)
  const perceptionSummary = `intent=${intent}; speed=${speedMps.toFixed(1)}m/s; neighbors=${seenCount}; tick=${draft.tick}`

  return {
    payload: {
      ...draft.payload,
      loop_perception: perceptionSummary,
      loop_decision: decision,
      loop_action: actionSummary,
      loop_policy: policy,
      loop_risk: riskScore,
    },
    nextMemory: {
      lastIntent: intent,
      lastSpeed: speedMps,
      lastSeenCount: seenCount,
    },
  }
}
