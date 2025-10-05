export type MemoryObject = Record<string, any>

// Simple in-memory store; swap with Redis/PG implementation later
const store = new Map<string, MemoryObject>()

export async function getMemory(profile: string): Promise<MemoryObject> {
  const key = profile || 'default'
  return store.get(key) ?? {}
}

export async function setMemory(profile: string, memory: MemoryObject): Promise<MemoryObject> {
  const key = profile || 'default'
  const next = memory && typeof memory === 'object' ? memory : {}
  store.set(key, next)
  return next
}


