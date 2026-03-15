export type AuditEventType = 'OBSERVE' | 'THINK' | 'ACTION'

export type Vec3Tuple = [number, number, number]

export interface AuditEventPayload {
  thought?: string
  position?: Vec3Tuple
  intent?: string
  seeing?: string[]
  confidence?: number
  speed_mps?: number
  target_agent?: string
  interaction?: string
  decision?: string
  [key: string]: unknown
}

export interface AuditEvent {
  tick: number
  agent_id: string
  type: AuditEventType
  payload: AuditEventPayload
  prev_hash: string
  signature: string
  hash: string
}

export interface AgentVisualState {
  position: Vec3Tuple
  thought: string
  intent: string
  seeing: string[]
  speed_mps: number
}

export interface AgentInteraction {
  from: string
  to: string
  label: string
}
