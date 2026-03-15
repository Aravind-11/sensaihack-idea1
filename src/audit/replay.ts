import type { AgentInteraction, AgentVisualState, AuditEvent, Vec3Tuple } from '../types/audit'

const DEFAULT_POSITION: Vec3Tuple = [0, 0.4, 0]
const DEFAULT_THOUGHT = 'Awaiting mission tick...'
const DEFAULT_INTENT = 'Hold lane'

type ReplayCache = {
  sorted: AuditEvent[]
  byTick: Map<number, AuditEvent[]>
  maxTick: number
}

const replayCacheByRef = new WeakMap<AuditEvent[], ReplayCache>()

const buildReplayCache = (logs: AuditEvent[]): ReplayCache => {
  const sorted = [...logs].sort((a, b) => a.tick - b.tick)
  const byTick = new Map<number, AuditEvent[]>()
  let maxTick = 0
  for (const event of sorted) {
    maxTick = Math.max(maxTick, event.tick)
    const bucket = byTick.get(event.tick)
    if (bucket) bucket.push(event)
    else byTick.set(event.tick, [event])
  }
  return { sorted, byTick, maxTick }
}

const getReplayCache = (logs: AuditEvent[]): ReplayCache => {
  const cached = replayCacheByRef.get(logs)
  if (cached) return cached
  const next = buildReplayCache(logs)
  replayCacheByRef.set(logs, next)
  return next
}

export const buildAgentStateAtTick = (
  logs: AuditEvent[],
  tick: number,
): Record<string, AgentVisualState> => {
  const { sorted } = getReplayCache(logs)
  const state: Record<string, AgentVisualState> = {}

  for (const event of sorted) {
    if (event.tick > tick) {
      break
    }

    const previous = state[event.agent_id] ?? {
      position: DEFAULT_POSITION,
      thought: DEFAULT_THOUGHT,
      intent: DEFAULT_INTENT,
      seeing: [],
      speed_mps: 0,
    }

    const nextPosition = Array.isArray(event.payload.position)
      ? (event.payload.position as Vec3Tuple)
      : previous.position
    const nextThought =
      typeof event.payload.thought === 'string' ? event.payload.thought : previous.thought
    const nextIntent =
      typeof event.payload.intent === 'string' ? event.payload.intent : previous.intent
    const nextSeeing = Array.isArray(event.payload.seeing)
      ? event.payload.seeing.filter((item): item is string => typeof item === 'string')
      : previous.seeing
    const nextSpeed =
      typeof event.payload.speed_mps === 'number' ? event.payload.speed_mps : previous.speed_mps

    state[event.agent_id] = {
      position: nextPosition,
      thought: nextThought,
      intent: nextIntent,
      seeing: nextSeeing,
      speed_mps: nextSpeed,
    }
  }

  return state
}

export const getMaxTick = (logs: AuditEvent[]): number =>
  getReplayCache(logs).maxTick

export const getInteractionsAtTick = (
  logs: AuditEvent[],
  tick: number,
): AgentInteraction[] =>
  (getReplayCache(logs).byTick.get(tick) ?? [])
    .filter(
      (event) =>
        typeof event.payload.target_agent === 'string' &&
        typeof event.payload.interaction === 'string',
    )
    .map((event) => ({
      from: event.agent_id,
      to: event.payload.target_agent as string,
      label: event.payload.interaction as string,
    }))
