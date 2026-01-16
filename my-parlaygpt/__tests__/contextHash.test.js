const { canonicalizeContext, hashContext } = require('../lib/contextHash')

test('hash is stable across key order', () => {
  const a = { context_version: 'v1', payload: { b: 2, a: 1 } }
  const b = { context_version: 'v1', payload: { a: 1, b: 2 } }
  const hashA = hashContext(a)
  const hashB = hashContext(b)
  expect(hashA).toBe(hashB)
})
