# Wrapper Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up a secure, stateless wrapper with optional auth, traceable context metadata, and a request deadline, then wire the Next API to pass request_id and context metadata.

**Architecture:** The wrapper runs as a dedicated Express server (Render) and enforces optional shared-secret auth when configured. The Next API calls the wrapper with request_id and context metadata; responses include request_id, context_version, context_hash, and data_provenance for debugging.

**Tech Stack:** Node/Express (wrapper), Next.js API routes (frontend), OpenAI SDK, Jest (wrapper tests).

### Task 1: Add wrapper auth and context hash utilities

**Files:**
- Create: `my-parlaygpt/lib/wrapperAuth.js`
- Create: `my-parlaygpt/lib/contextHash.js`
- Test: `my-parlaygpt/__tests__/wrapperAuth.test.js`
- Test: `my-parlaygpt/__tests__/contextHash.test.js`

**Step 1: Write the failing auth test**

```js
const { checkWrapperAuth } = require('../lib/wrapperAuth')

test('rejects missing auth when token is set', () => {
  const req = { headers: {} }
  const result = checkWrapperAuth(req, { headerName: 'authorization', token: 'secret' })
  expect(result.ok).toBe(false)
  expect(result.reason).toMatch(/missing/i)
})
```

**Step 2: Run test to verify it fails**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/wrapperAuth.test.js`
Expected: FAIL (module not found)

**Step 3: Write minimal auth implementation**

```js
function checkWrapperAuth(req, { headerName, token }) {
  if (!token) return { ok: true }
  const raw = req.headers?.[headerName.toLowerCase()] || ''
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return { ok: false, reason: 'missing auth header' }
  const normalized = value.startsWith('Bearer ') ? value.slice('Bearer '.length) : value
  if (normalized !== token) return { ok: false, reason: 'invalid token' }
  return { ok: true }
}
```

**Step 4: Run test to verify it passes**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/wrapperAuth.test.js`
Expected: PASS

**Step 5: Write failing context hash test**

```js
const { canonicalizeContext, hashContext } = require('../lib/contextHash')

test('hash is stable across key order', () => {
  const a = { context_version: 'v1', payload: { b: 2, a: 1 } }
  const b = { context_version: 'v1', payload: { a: 1, b: 2 } }
  const hashA = hashContext(a)
  const hashB = hashContext(b)
  expect(hashA).toBe(hashB)
})
```

**Step 6: Run test to verify it fails**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/contextHash.test.js`
Expected: FAIL (module not found)

**Step 7: Write minimal context hash implementation**

```js
const crypto = require('crypto')

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key])
      return acc
    }, {})
  }
  return value
}

function canonicalizeContext(input) {
  const canonical = canonicalize(input)
  return JSON.stringify(canonical)
}

function hashContext(input) {
  const json = canonicalizeContext(input)
  return crypto.createHash('sha256').update(json).digest('hex')
}

module.exports = { canonicalizeContext, hashContext }
```

**Step 8: Run test to verify it passes**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/contextHash.test.js`
Expected: PASS

**Step 9: Commit**

```bash
git add my-parlaygpt/lib/wrapperAuth.js my-parlaygpt/lib/contextHash.js my-parlaygpt/__tests__/wrapperAuth.test.js my-parlaygpt/__tests__/contextHash.test.js
git commit -m "feat(wrapper): add auth and context hash utilities"
```

### Task 2: Enforce wrapper auth, request_id, and deadline

**Files:**
- Modify: `my-parlaygpt/server.js`
- Test: `my-parlaygpt/__tests__/wrapperAuth.test.js`

**Step 1: Write failing test for Bearer parsing**

```js
const { checkWrapperAuth } = require('../lib/wrapperAuth')

test('accepts Bearer tokens', () => {
  const req = { headers: { authorization: 'Bearer secret' } }
  const result = checkWrapperAuth(req, { headerName: 'authorization', token: 'secret' })
  expect(result.ok).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/wrapperAuth.test.js`
Expected: FAIL (Bearer parsing missing)

**Step 3: Update wrapperAuth implementation**

```js
// ensure Bearer parsing logic is present
```

**Step 4: Run test to verify it passes**

Run: `cd my-parlaygpt && npm test -- --runTestsByPath __tests__/wrapperAuth.test.js`
Expected: PASS

**Step 5: Implement auth middleware + allowlist + deadline**

- Read env vars: WRAPPER_AUTH_TOKEN, WRAPPER_AUTH_HEADER (default Authorization), WRAPPER_ALLOWED_ORIGINS, WRAPPER_TIMEOUT_MS (default 25000).
- Add middleware before routes:
  - Reject methods not in [GET, POST] with 405.
  - Reject paths outside /api/* with 404.
  - If WRAPPER_AUTH_TOKEN set, validate header using checkWrapperAuth.
- Wrap OpenAI calls in AbortController with timeout.
- Extract request_id from header `x-request-id` or body and include in logs and response payload.

**Step 6: Manual verification**

Run: `cd my-parlaygpt && node server.js`
Run: `curl -i -X POST http://localhost:5000/api/afb -H 'Content-Type: application/json' -d '{"matchup":"A @ B"}'`
Expected: 200 or structured error; response includes request_id when provided.

**Step 7: Commit**

```bash
git add my-parlaygpt/server.js
git commit -m "feat(wrapper): enforce optional auth and request deadline"
```

### Task 3: Add context hash metadata and request_id in Next API

**Files:**
- Create: `lib/context/hash.js`
- Test: `__tests__/context-hash.test.js`
- Modify: `app/api/afb/route.ts`
- Modify: `app/api/context/debug/route.ts`

**Step 1: Write failing test for hash canonicalization**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { hashContextPayload } = require('../lib/context/hash')

test('hash is stable across key order', () => {
  const a = { context_version: 'v1', payload: { b: 2, a: 1 } }
  const b = { context_version: 'v1', payload: { a: 1, b: 2 } }
  assert.equal(hashContextPayload(a), hashContextPayload(b))
})
```

**Step 2: Run test to verify it fails**

Run: `node --test __tests__/context-hash.test.js`
Expected: FAIL (module not found)

**Step 3: Implement hash utility and wire metadata**

- Add `hashContextPayload` using SHA-256 and canonical JSON (sorted keys).
- In `app/api/afb/route.ts`:
  - Generate request_id (UUID) and pass as header `x-request-id` to wrapper.
  - Build context payload object with instruction, rawContext, truncated, blocks, context_version.
  - Compute context_hash and include it in the wrapper request metadata and the final API response.
  - Include data_provenance summary (from getContextSummary) in the response.
- In `app/api/context/debug/route.ts`:
  - Add context_version and context_hash fields alongside existing output.

**Step 4: Run test to verify it passes**

Run: `node --test __tests__/context-hash.test.js`
Expected: PASS

**Step 5: Manual verification**

- Hit `/api/context/debug?matchup=...` and verify context_hash and context_version appear.
- Trigger `/api/afb` and confirm response includes request_id + context_hash.

**Step 6: Commit**

```bash
git add lib/context/hash.js __tests__/context-hash.test.js app/api/afb/route.ts app/api/context/debug/route.ts
git commit -m "feat(api): include context hash metadata and request id"
```
