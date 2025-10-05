export type MemoryObject = Record<string, any>

// NOTE: This is an in-memory, best-effort store intended for local/dev only.
// It resets on server restart/redeploy. It is bounded to avoid OOM via a
// naive LRU eviction policy. Swap with Redis/PG for persistence.
const MAX_PROFILES = Number(process.env.MEMORY_MAX_PROFILES || 100)
const MAX_BYTES_TOTAL = Number(process.env.MEMORY_MAX_BYTES || 1_000_000) // ~1MB

const store = new Map<string, MemoryObject>()
const profileSizes = new Map<string, number>()
const lruOrder: string[] = [] // most-recently used pushed to end

function approxSize(obj: MemoryObject): number {
  try { return JSON.stringify(obj).length } catch { return 0 }
}

function touch(profile: string) {
  const idx = lruOrder.indexOf(profile)
  if (idx !== -1) lruOrder.splice(idx, 1)
  lruOrder.push(profile)
}

function totalBytes(): number {
  let sum = 0
  for (const sz of profileSizes.values()) sum += sz
  return sum
}

function evictIfNeeded() {
  // Evict while over either bound
  while ((store.size > MAX_PROFILES) || (totalBytes() > MAX_BYTES_TOTAL)) {
    const victim = lruOrder.shift()
    if (!victim) break
    store.delete(victim)
    const sz = profileSizes.get(victim) || 0
    profileSizes.delete(victim)
  }
}

export async function getMemory(profile: string): Promise<MemoryObject> {
  const key = profile || 'default'
  const val = store.get(key)
  if (val) touch(key)
  return val ?? {}
}

export async function setMemory(profile: string, memory: MemoryObject): Promise<MemoryObject> {
  const key = profile || 'default'
  const next = memory && typeof memory === 'object' ? memory : {}
  store.set(key, next)
  profileSizes.set(key, approxSize(next))
  touch(key)
  evictIfNeeded()
  return next
}

// Allow only safe, bounded fields to be forwarded to the model
export function sanitizeMemoryForPrompt(memory: MemoryObject | undefined): MemoryObject | undefined {
  if (!memory || typeof memory !== 'object') return undefined
  const out: MemoryObject = {}
  // house_rules: up to 10 short strings, trimmed and length-capped
  const rules = Array.isArray(memory.house_rules) ? memory.house_rules : []
  const cleanRules = rules
    .filter((v) => typeof v === 'string')
    .slice(0, 10)
    .map((v) => v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160))
    .filter(Boolean)
  if (cleanRules.length) out.house_rules = cleanRules
  // angles_preferred: optional hints to bias prompt
  const angles = Array.isArray((memory as any).angles_preferred) ? (memory as any).angles_preferred : []
  const cleanAngles = angles
    .filter((v: any) => typeof v === 'string')
    .slice(0, 10)
    .map((v: string) => v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40))
    .filter(Boolean)
  if (cleanAngles.length) (out as any).angles_preferred = cleanAngles
  // Return undefined if empty to avoid prompt bloat
  return Object.keys(out).length ? out : undefined
}


