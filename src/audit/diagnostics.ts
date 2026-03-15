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

export const buildAIAuditDiagnosis = (
  logs: AuditEvent[],
  currentTick: number,
  agentIds: string[],
): AuditDiagnosis => {
  const windowed = logs.filter((log) => log.tick <= currentTick && agentIds.includes(log.agent_id))
  const perAgent: AgentAuditSummary[] = agentIds.map((agentId) => {
    const events = windowed.filter((event) => event.agent_id === agentId)
    const confidences = events
      .map((event) => event.payload.confidence)
      .filter((value): value is number => typeof value === 'number')
    const maxSpeed = events.reduce((max, event) => {
      const speed = typeof event.payload.speed_mps === 'number' ? event.payload.speed_mps : 0
      return Math.max(max, speed)
    }, 0)

    return {
      agentId,
      eventCount: events.length,
      avgConfidence:
        confidences.length > 0
          ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(2))
          : null,
      maxSpeed: Number(maxSpeed.toFixed(1)),
      lowConfidenceEvents: events.filter(
        (event) => typeof event.payload.confidence === 'number' && event.payload.confidence < 0.85,
      ).length,
      interactionEvents: events.filter((event) => typeof event.payload.interaction === 'string').length,
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
