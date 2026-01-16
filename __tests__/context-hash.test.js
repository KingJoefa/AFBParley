const test = require('node:test')
const assert = require('node:assert/strict')
const { hashContextPayload } = require('../lib/context/hash')

test('hash is stable across key order', () => {
  const a = { context_version: 'v1', payload: { b: 2, a: 1 } }
  const b = { context_version: 'v1', payload: { a: 1, b: 2 } }
  assert.equal(hashContextPayload(a), hashContextPayload(b))
})
