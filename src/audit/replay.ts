import type { AgentInteraction, AgentVisualState, AuditEvent, Vec3Tuple } from '../types/audit'

const DEFAULT_POSITION: Vec3Tuple = [0, 0.4, 0]
const DEFAULT_THOUGHT = 'Awaiting mission tick...'
const DEFAULT_INTENT = 'Hold lane'

export const buildAgentStateAtTick = (
  logs: AuditEvent[],
  tick: number,
): Record<string, AgentVisualState> => {
  const sorted = [...logs].sort((a, b) => a.tick - b.tick)
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
  logs.reduce((max, event) => Math.max(max, event.tick), 0)

export const getInteractionsAtTick = (
  logs: AuditEvent[],
  tick: number,
): AgentInteraction[] =>
  logs
    .filter(
      (event) =>
        event.tick === tick &&
        typeof event.payload.target_agent === 'string' &&
        typeof event.payload.interaction === 'string',
    )
    .map((event) => ({
      from: event.agent_id,
      to: event.payload.target_agent as string,
      label: event.payload.interaction as string,
    }))
