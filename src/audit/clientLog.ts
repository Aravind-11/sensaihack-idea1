import type { AuditEvent, AuditEventPayload, AuditEventType } from '../types/audit'
import cityMergeDraftsRaw from './cityMergeDrafts.json'
import highwayDraftsRaw from './highwayDrafts.json'

const DEMO_SECRET = 'demo-webspatial-hmac-secret'
const ZERO_HASH = '0'.repeat(64)

export interface DraftAuditEvent {
  tick: number
  agent_id: string
  type: AuditEventType
  payload: AuditEventPayload
}

export type ScenarioId = 'city-merge' | 'highway'

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

const cityMergeDrafts: DraftAuditEvent[] = cityMergeDraftsRaw as DraftAuditEvent[]
const highwayDrafts: DraftAuditEvent[] = highwayDraftsRaw as DraftAuditEvent[]


const getScenarioDrafts = (scenario: ScenarioId): DraftAuditEvent[] => {
  if (scenario === 'highway') return highwayDrafts
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
