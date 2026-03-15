import { createHash, createHmac } from 'node:crypto'

export type AuditEventType = 'OBSERVE' | 'THINK' | 'ACTION'

export interface EventPayload {
  [key: string]: unknown
}

export interface Event {
  tick: number
  agent_id: string
  type: AuditEventType
  payload: EventPayload
  prev_hash: string
  signature: string
  hash: string
}

const ZERO_HASH = '0'.repeat(64)

const canonicalPayload = (payload: EventPayload): string => JSON.stringify(payload)

const computeSignature = (
  event: Pick<Event, 'tick' | 'agent_id' | 'type' | 'payload'>,
  prevHash: string,
  secret: string,
): string => {
  const content = `${event.tick}|${event.agent_id}|${event.type}|${canonicalPayload(event.payload)}|${prevHash}`
  return createHmac('sha256', secret).update(content).digest('hex')
}

const computeHash = (event: Omit<Event, 'hash'>): string => {
  const content = `${event.tick}|${event.agent_id}|${event.type}|${canonicalPayload(event.payload)}|${event.prev_hash}|${event.signature}`
  return createHash('sha256').update(content).digest('hex')
}

export class AuditLogger {
  private chain: Event[] = []

  constructor(private readonly secret: string) {}

  append(
    draft: Pick<Event, 'tick' | 'agent_id' | 'type' | 'payload'>,
  ): Event {
    const prev_hash = this.chain.at(-1)?.hash ?? ZERO_HASH
    const signature = computeSignature(draft, prev_hash, this.secret)
    const baseEvent: Omit<Event, 'hash'> = { ...draft, prev_hash, signature }
    const event: Event = {
      ...baseEvent,
      hash: computeHash(baseEvent),
    }
    this.chain.push(event)
    return event
  }

  getLogs(): Event[] {
    return [...this.chain]
  }
}

export function verifyLogChain(logs: Event[], secret: string): boolean {
  for (let i = 0; i < logs.length; i += 1) {
    const current = logs[i]
    const previous = logs[i - 1]
    const expectedPrev = previous?.hash ?? ZERO_HASH
    if (current.prev_hash !== expectedPrev) {
      return false
    }

    const expectedSignature = computeSignature(
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

    const expectedHash = computeHash({
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
