import type { AuditEvent, AuditEventPayload, AuditEventType } from '../types/audit'

const DEMO_SECRET = 'demo-webspatial-hmac-secret'
const ZERO_HASH = '0'.repeat(64)

export interface DraftAuditEvent {
  tick: number
  agent_id: string
  type: AuditEventType
  payload: AuditEventPayload
}

export type ScenarioId = 'city-merge' | 'highway' | 'roundabout'

const canonicalPayload = (payload: AuditEventPayload): string => JSON.stringify(payload)

const bytesToHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

const hmacHex = async (value: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(signature))
}

const computeEventHash = async (event: Omit<AuditEvent, 'hash'>): Promise<string> => {
  const content = `${event.tick}|${event.agent_id}|${event.type}|${canonicalPayload(event.payload)}|${event.prev_hash}|${event.signature}`
  return sha256Hex(content)
}

const computeSignature = async (event: DraftAuditEvent, prevHash: string, secret: string): Promise<string> => {
  const content = `${event.tick}|${event.agent_id}|${event.type}|${canonicalPayload(event.payload)}|${prevHash}`
  return hmacHex(content, secret)
}

export const appendClientEvent = async (
  previous: AuditEvent | undefined,
  draft: DraftAuditEvent,
  secret = DEMO_SECRET,
): Promise<AuditEvent> => {
  const prev_hash = previous?.hash ?? ZERO_HASH
  const signature = await computeSignature(draft, prev_hash, secret)
  const baseEvent: Omit<AuditEvent, 'hash'> = { ...draft, prev_hash, signature }

  return {
    ...baseEvent,
    hash: await computeEventHash(baseEvent),
  }
}

const cityMergeDrafts: DraftAuditEvent[] = [
  {
    tick: 1,
    agent_id: 'car-alpha',
    type: 'OBSERVE',
    payload: {
      thought: 'Front lane clear 18m, merge lane occupied.',
      intent: 'Cruise',
      seeing: ['car-beta'],
      confidence: 0.93,
      speed_mps: 14.2,
      position: [-4.8, 0.4, -1.2],
    },
  },
  {
    tick: 2,
    agent_id: 'car-beta',
    type: 'OBSERVE',
    payload: {
      thought: 'Detecting car-alpha at left rear quarter.',
      intent: 'Maintain lane',
      seeing: ['car-alpha', 'car-gamma'],
      confidence: 0.9,
      speed_mps: 12.8,
      position: [-2.1, 0.4, 1.2],
    },
  },
  {
    tick: 3,
    agent_id: 'car-gamma',
    type: 'THINK',
    payload: {
      thought: 'Planning lane merge in 3.2s gap.',
      intent: 'Merge left',
      seeing: ['car-beta'],
      decision: 'Wait one cycle',
      confidence: 0.84,
      speed_mps: 11.4,
      position: [-0.6, 0.4, -4.8],
    },
  },
  {
    tick: 3,
    agent_id: 'car-delta',
    type: 'OBSERVE',
    payload: {
      thought: 'Holding right lane near intersection.',
      intent: 'Standby support',
      seeing: ['car-alpha', 'car-beta'],
      confidence: 0.9,
      speed_mps: 9.8,
      position: [-3.8, 0.4, 2.7],
    },
  },
  {
    tick: 4,
    agent_id: 'car-alpha',
    type: 'ACTION',
    payload: {
      thought: 'Reducing speed to open safe merge gap.',
      intent: 'Yield',
      interaction: 'yielding-gap',
      target_agent: 'car-gamma',
      position: [-1.8, 0.4, -1.2],
      speed_mps: 10.1,
      confidence: 0.95,
    },
  },
  {
    tick: 5,
    agent_id: 'car-beta',
    type: 'ACTION',
    payload: {
      thought: 'Holding lane and broadcasting intent.',
      intent: 'Cooperate',
      interaction: 'broadcast-intent',
      target_agent: 'car-gamma',
      position: [0.8, 0.4, 1.2],
      speed_mps: 12.2,
      confidence: 0.91,
    },
  },
  {
    tick: 6,
    agent_id: 'car-gamma',
    type: 'ACTION',
    payload: {
      thought: 'Executing merge between alpha and beta.',
      intent: 'Merge complete',
      interaction: 'accepted-gap',
      target_agent: 'car-alpha',
      position: [-0.4, 0.4, -0.3],
      speed_mps: 11.7,
      confidence: 0.88,
    },
  },
  {
    tick: 7,
    agent_id: 'car-alpha',
    type: 'THINK',
    payload: {
      thought: 'Replanning route after merge event.',
      intent: 'Resume cruise',
      seeing: ['car-gamma', 'car-beta'],
      decision: 'Increase to nominal speed',
      speed_mps: 11.5,
      position: [-0.2, 0.4, -1.2],
    },
  },
  {
    tick: 8,
    agent_id: 'car-beta',
    type: 'ACTION',
    payload: {
      thought: 'Adjusting spacing for platoon.',
      intent: 'Form platoon',
      interaction: 'spacing-adjust',
      target_agent: 'car-gamma',
      position: [2.8, 0.4, 1.2],
      speed_mps: 11.3,
      confidence: 0.92,
    },
  },
  {
    tick: 8,
    agent_id: 'car-delta',
    type: 'ACTION',
    payload: {
      thought: 'Adjusting to keep buffer behind beta.',
      intent: 'Buffer maintain',
      interaction: 'spacing-adjust',
      target_agent: 'car-beta',
      position: [1.8, 0.4, 2.4],
      speed_mps: 10.5,
      confidence: 0.88,
    },
  },
  {
    tick: 9,
    agent_id: 'car-gamma',
    type: 'OBSERVE',
    payload: {
      thought: 'Lane occupancy stable, hazard probability low.',
      intent: 'Track lane',
      seeing: ['car-alpha', 'car-beta'],
      confidence: 0.94,
      speed_mps: 12.1,
      position: [0.8, 0.4, -0.2],
    },
  },
  {
    tick: 10,
    agent_id: 'car-alpha',
    type: 'ACTION',
    payload: {
      thought: 'Lane change right for exit preparation.',
      intent: 'Exit prep',
      interaction: 'lane-change',
      target_agent: 'car-beta',
      position: [2.2, 0.4, -1.2],
      speed_mps: 10.8,
      confidence: 0.89,
    },
  },
  {
    tick: 11,
    agent_id: 'car-gamma',
    type: 'ACTION',
    payload: {
      thought: 'Taking lead position in platoon.',
      intent: 'Lead',
      interaction: 'overtake',
      target_agent: 'car-beta',
      position: [2.3, 0.4, -0.1],
      speed_mps: 12.6,
      confidence: 0.87,
    },
  },
  {
    tick: 12,
    agent_id: 'car-beta',
    type: 'THINK',
    payload: {
      thought: 'Cooperative route solved: no collision risk.',
      intent: 'Stabilize',
      seeing: ['car-alpha', 'car-gamma'],
      decision: 'Maintain 2.5s headway',
      confidence: 0.96,
      speed_mps: 11.8,
      position: [4.8, 0.4, 1.2],
    },
  },
  {
    tick: 12,
    agent_id: 'car-delta',
    type: 'THINK',
    payload: {
      thought: 'Route remains clear; cooperative spacing maintained.',
      intent: 'Stabilize',
      seeing: ['car-alpha', 'car-beta', 'car-gamma'],
      confidence: 0.95,
      speed_mps: 10.9,
      position: [4.1, 0.4, 2.1],
    },
  },
]

const highwayDrafts: DraftAuditEvent[] = [
  { tick: 1, agent_id: 'car-alpha', type: 'OBSERVE', payload: { thought: 'Cruising lane-1; truck ahead 40m.', intent: 'Cruise', speed_mps: 22, position: [-8, 0.4, -1.5] } },
  { tick: 2, agent_id: 'car-beta', type: 'OBSERVE', payload: { thought: 'Maintaining lane-2, clear rear.', intent: 'Hold lane', speed_mps: 20, position: [-6.2, 0.4, 1.5] } },
  { tick: 3, agent_id: 'car-gamma', type: 'THINK', payload: { thought: 'Predicting safe overtake window.', intent: 'Overtake', speed_mps: 23, decision: 'Signal left', position: [-4.8, 0.4, -1.5] } },
  { tick: 3, agent_id: 'car-delta', type: 'OBSERVE', payload: { thought: 'Monitoring far-right lane stability.', intent: 'Escort', speed_mps: 19.2, position: [-4.4, 0.4, 3.1] } },
  { tick: 4, agent_id: 'car-gamma', type: 'ACTION', payload: { thought: 'Initiating overtake on lane-1.', intent: 'Pass beta', interaction: 'overtake', target_agent: 'car-beta', speed_mps: 24, position: [-3.1, 0.4, 0.2] } },
  { tick: 5, agent_id: 'car-beta', type: 'ACTION', payload: { thought: 'Yielding speed to maintain gap.', intent: 'Yield', interaction: 'yielding-gap', target_agent: 'car-gamma', speed_mps: 18.5, position: [-2, 0.4, 1.5] } },
  { tick: 6, agent_id: 'car-alpha', type: 'ACTION', payload: { thought: 'Joining platoon behind gamma.', intent: 'Platoon join', interaction: 'follow', target_agent: 'car-gamma', speed_mps: 21.3, position: [-0.8, 0.4, -1.5] } },
  { tick: 7, agent_id: 'car-gamma', type: 'OBSERVE', payload: { thought: 'Left lane clear for 60m.', intent: 'Lead', speed_mps: 24.5, seeing: ['car-alpha'], position: [0.8, 0.4, -1.5] } },
  { tick: 8, agent_id: 'car-beta', type: 'THINK', payload: { thought: 'Preparing merge behind alpha.', intent: 'Merge behind', decision: 'wait 1 tick', speed_mps: 19.4, position: [1.6, 0.4, 1.5] } },
  { tick: 9, agent_id: 'car-beta', type: 'ACTION', payload: { thought: 'Merging behind alpha, gap accepted.', intent: 'Merge complete', interaction: 'accepted-gap', target_agent: 'car-alpha', speed_mps: 20.1, position: [3.4, 0.4, -0.3] } },
  { tick: 9, agent_id: 'car-delta', type: 'ACTION', payload: { thought: 'Sliding right to avoid compression.', intent: 'Deconflict', interaction: 'yielding-gap', target_agent: 'car-beta', speed_mps: 18.8, position: [3.8, 0.4, 2.8] } },
  { tick: 10, agent_id: 'car-alpha', type: 'OBSERVE', payload: { thought: 'Platoon spacing within policy.', intent: 'Stabilize', speed_mps: 21.6, seeing: ['car-beta', 'car-gamma'], position: [4.8, 0.4, -1.5] } },
  { tick: 11, agent_id: 'car-gamma', type: 'ACTION', payload: { thought: 'Requesting lane return after pass.', intent: 'Return lane', interaction: 'lane-change', target_agent: 'car-alpha', speed_mps: 22.9, position: [6.4, 0.4, 0.4] } },
  { tick: 12, agent_id: 'car-alpha', type: 'THINK', payload: { thought: 'Route solved with no collision risk.', intent: 'Cruise', confidence: 0.97, speed_mps: 21.9, position: [8.2, 0.4, -1.5] } },
  { tick: 12, agent_id: 'car-delta', type: 'THINK', payload: { thought: 'Traffic envelope stable in escort lane.', intent: 'Stabilize', confidence: 0.93, speed_mps: 19.3, position: [8.6, 0.4, 2.8] } },
]

const roundaboutDrafts: DraftAuditEvent[] = [
  { tick: 1, agent_id: 'car-alpha', type: 'OBSERVE', payload: { thought: 'Approaching roundabout entry north.', intent: 'Enter roundabout', speed_mps: 11.2, position: [0, 0.4, 6.2] } },
  { tick: 2, agent_id: 'car-beta', type: 'OBSERVE', payload: { thought: 'Inside circle exiting east soon.', intent: 'Continue clockwise', speed_mps: 10.4, position: [3.8, 0.4, 1.2] } },
  { tick: 3, agent_id: 'car-gamma', type: 'THINK', payload: { thought: 'Waiting at west entry for alpha gap.', intent: 'Yield at entry', decision: 'hold', speed_mps: 5.8, position: [-6.1, 0.4, 0] } },
  { tick: 3, agent_id: 'car-delta', type: 'OBSERVE', payload: { thought: 'Queueing at south entry, checking circulation.', intent: 'Yield at entry', speed_mps: 6.1, position: [0, 0.4, -6.2] } },
  { tick: 4, agent_id: 'car-beta', type: 'ACTION', payload: { thought: 'Signaling exit east branch.', intent: 'Exit roundabout', interaction: 'broadcast-intent', target_agent: 'car-alpha', speed_mps: 9.7, position: [5.8, 0.4, 0] } },
  { tick: 5, agent_id: 'car-alpha', type: 'ACTION', payload: { thought: 'Entering roundabout after beta exit.', intent: 'Join circle', interaction: 'accepted-gap', target_agent: 'car-beta', speed_mps: 9.9, position: [1.6, 0.4, 3.4] } },
  { tick: 6, agent_id: 'car-gamma', type: 'ACTION', payload: { thought: 'Following alpha into circle.', intent: 'Join circle', interaction: 'follow', target_agent: 'car-alpha', speed_mps: 8.8, position: [-1.2, 0.4, -3.5] } },
  { tick: 7, agent_id: 'car-alpha', type: 'OBSERVE', payload: { thought: 'Target exit south in 2 segments.', intent: 'Continue clockwise', speed_mps: 10.5, seeing: ['car-gamma'], position: [3.3, 0.4, -1.4] } },
  { tick: 8, agent_id: 'car-gamma', type: 'THINK', payload: { thought: 'Keeping 2s headway from alpha.', intent: 'Track lead', speed_mps: 8.6, position: [-3.2, 0.4, 1.5] } },
  { tick: 9, agent_id: 'car-alpha', type: 'ACTION', payload: { thought: 'Exiting south branch.', intent: 'Exit', interaction: 'lane-change', target_agent: 'car-gamma', speed_mps: 9.3, position: [0, 0.4, -6.1] } },
  { tick: 9, agent_id: 'car-delta', type: 'ACTION', payload: { thought: 'Entering after gamma clears inner ring.', intent: 'Join circle', interaction: 'accepted-gap', target_agent: 'car-gamma', speed_mps: 8.4, position: [-1.6, 0.4, -3.4] } },
  { tick: 10, agent_id: 'car-gamma', type: 'ACTION', payload: { thought: 'Continuing one more loop.', intent: 'Circle continue', interaction: 'yielding-gap', target_agent: 'car-beta', speed_mps: 8.4, position: [1.7, 0.4, 3.1] } },
  { tick: 11, agent_id: 'car-beta', type: 'OBSERVE', payload: { thought: 'Re-entering from east feeder.', intent: 'Merge in', speed_mps: 9.8, seeing: ['car-gamma'], position: [6.1, 0.4, 0] } },
  { tick: 12, agent_id: 'car-gamma', type: 'THINK', payload: { thought: 'Roundabout clear; planning west exit.', intent: 'Prepare exit', decision: 'exit west', speed_mps: 9.1, position: [-6.2, 0.4, 0] } },
  { tick: 12, agent_id: 'car-delta', type: 'THINK', payload: { thought: 'Flow balanced across entries, no conflict.', intent: 'Stabilize', confidence: 0.94, speed_mps: 8.9, position: [2.8, 0.4, 3.2] } },
]

const getScenarioDrafts = (scenario: ScenarioId): DraftAuditEvent[] => {
  if (scenario === 'highway') return highwayDrafts
  if (scenario === 'roundabout') return roundaboutDrafts
  return cityMergeDrafts
}

export const buildDemoLogChain = async (scenario: ScenarioId = 'city-merge'): Promise<AuditEvent[]> => {
  const drafts = getScenarioDrafts(scenario)
  const chain: AuditEvent[] = []
  for (const draft of drafts) {
    const nextEvent = await appendClientEvent(chain.at(-1), draft)
    chain.push(nextEvent)
  }
  return chain
}

export const verifyLogChain = async (logs: AuditEvent[], secret = DEMO_SECRET): Promise<boolean> => {
  for (let i = 0; i < logs.length; i += 1) {
    const current = logs[i]
    const previous = logs[i - 1]
    const expectedPrevHash = previous?.hash ?? ZERO_HASH
    if (current.prev_hash !== expectedPrevHash) {
      return false
    }

    const expectedSignature = await computeSignature(
      {
        tick: current.tick,
        agent_id: current.agent_id,
        type: current.type,
        payload: current.payload,
      },
      current.prev_hash,
      secret,
    )
    if (current.signature !== expectedSignature) {
      return false
    }

    const expectedHash = await computeEventHash({
      tick: current.tick,
      agent_id: current.agent_id,
      type: current.type,
      payload: current.payload,
      prev_hash: current.prev_hash,
      signature: current.signature,
    })
    if (current.hash !== expectedHash) {
      return false
    }
  }

  return true
}
