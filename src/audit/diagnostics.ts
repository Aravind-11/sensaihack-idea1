import type { AuditEvent } from '../types/audit'

export interface AgentAuditSummary {
  agentId: string
  eventCount: number
  avgConfidence: number | null
  maxSpeed: number
  lowConfidenceEvents: number
  interactionEvents: number
}

export interface AuditFinding {
  severity: 'info' | 'warning' | 'critical'
  message: string
}

export interface AuditDiagnosis {
  perAgent: AgentAuditSummary[]
  findings: AuditFinding[]
}

type AgentSeries = {
  events: AuditEvent[]
  ticks: number[]
  prefixConfidenceSum: number[]
  prefixConfidenceCount: number[]
  prefixLowConfidence: number[]
  prefixInteractionCount: number[]
  prefixMaxSpeed: number[]
}

type DiagnosisCache = {
  byAgent: Map<string, AgentSeries>
}

const diagnosisCacheByRef = new WeakMap<AuditEvent[], DiagnosisCache>()

const upperBoundTick = (ticks: number[], value: number): number => {
  let lo = 0
  let hi = ticks.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ticks[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

const buildAgentSeries = (events: AuditEvent[]): AgentSeries => {
  const ticks: number[] = []
  const prefixConfidenceSum: number[] = [0]
  const prefixConfidenceCount: number[] = [0]
  const prefixLowConfidence: number[] = [0]
  const prefixInteractionCount: number[] = [0]
  const prefixMaxSpeed: number[] = [0]

  for (const event of events) {
    ticks.push(event.tick)
    const confidence = typeof event.payload.confidence === 'number' ? event.payload.confidence : null
    const speed = typeof event.payload.speed_mps === 'number' ? event.payload.speed_mps : 0
    const hasInteraction = typeof event.payload.interaction === 'string' ? 1 : 0
    prefixConfidenceSum.push(prefixConfidenceSum[prefixConfidenceSum.length - 1] + (confidence ?? 0))
    prefixConfidenceCount.push(prefixConfidenceCount[prefixConfidenceCount.length - 1] + (confidence === null ? 0 : 1))
    prefixLowConfidence.push(
      prefixLowConfidence[prefixLowConfidence.length - 1] + (confidence !== null && confidence < 0.85 ? 1 : 0),
    )
    prefixInteractionCount.push(prefixInteractionCount[prefixInteractionCount.length - 1] + hasInteraction)
    prefixMaxSpeed.push(Math.max(prefixMaxSpeed[prefixMaxSpeed.length - 1], speed))
  }

  return {
    events,
    ticks,
    prefixConfidenceSum,
    prefixConfidenceCount,
    prefixLowConfidence,
    prefixInteractionCount,
    prefixMaxSpeed,
  }
}

const getDiagnosisCache = (logs: AuditEvent[]): DiagnosisCache => {
  const cached = diagnosisCacheByRef.get(logs)
  if (cached) return cached
  const grouped = new Map<string, AuditEvent[]>()
  for (const event of logs) {
    const bucket = grouped.get(event.agent_id)
    if (bucket) bucket.push(event)
    else grouped.set(event.agent_id, [event])
  }
  const byAgent = new Map<string, AgentSeries>()
  for (const [agentId, events] of grouped.entries()) {
    events.sort((a, b) => a.tick - b.tick)
    byAgent.set(agentId, buildAgentSeries(events))
  }
  const next = { byAgent }
  diagnosisCacheByRef.set(logs, next)
  return next
}

export const buildAIAuditDiagnosis = (
  logs: AuditEvent[],
  currentTick: number,
  agentIds: string[],
): AuditDiagnosis => {
  const cache = getDiagnosisCache(logs)
  const perAgent: AgentAuditSummary[] = agentIds.map((agentId) => {
    const series = cache.byAgent.get(agentId)
    if (!series) {
      return {
        agentId,
        eventCount: 0,
        avgConfidence: null,
        maxSpeed: 0,
        lowConfidenceEvents: 0,
        interactionEvents: 0,
      }
    }
    const end = upperBoundTick(series.ticks, currentTick)
    const confidenceSum = series.prefixConfidenceSum[end]
    const confidenceCount = series.prefixConfidenceCount[end]
    return {
      agentId,
      eventCount: end,
      avgConfidence: confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(2)) : null,
      maxSpeed: Number(series.prefixMaxSpeed[end].toFixed(1)),
      lowConfidenceEvents: series.prefixLowConfidence[end],
      interactionEvents: series.prefixInteractionCount[end],
    }
  })

  const totalLowConfidence = perAgent.reduce((sum, summary) => sum + summary.lowConfidenceEvents, 0)
  const maxObservedSpeed = perAgent.reduce((max, summary) => Math.max(max, summary.maxSpeed), 0)
  const totalInteractions = perAgent.reduce((sum, summary) => sum + summary.interactionEvents, 0)

  const findings: AuditFinding[] = []

  if (totalLowConfidence > 0) {
    findings.push({
      severity: totalLowConfidence > 2 ? 'critical' : 'warning',
      message: `${totalLowConfidence} low-confidence decisions detected (confidence < 0.85).`,
    })
  } else {
    findings.push({
      severity: 'info',
      message: 'No low-confidence decisions detected in the replay window.',
    })
  }

  if (maxObservedSpeed > 24) {
    findings.push({
      severity: 'warning',
      message: `High-speed maneuver observed at ${maxObservedSpeed.toFixed(1)} m/s.`,
    })
  } else {
    findings.push({
      severity: 'info',
      message: `Speed envelope is stable (max ${maxObservedSpeed.toFixed(1)} m/s).`,
    })
  }

  findings.push({
    severity: totalInteractions < 2 ? 'warning' : 'info',
    message:
      totalInteractions < 2
        ? 'Low interaction density: coordination events are sparse.'
        : `${totalInteractions} interaction events logged (yield, overtake, merge, etc.).`,
  })

  return { perAgent, findings }
}
