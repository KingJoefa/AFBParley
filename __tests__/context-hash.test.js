const { hashContextPayload } = require('../lib/context/hash')

test('hash is stable across key order', () => {
  const a = { context_version: 'v1', payload: { b: 2, a: 1 } }
  const b = { context_version: 'v1', payload: { a: 1, b: 2 } }
  expect(hashContextPayload(a)).toEqual(hashContextPayload(b))
})
