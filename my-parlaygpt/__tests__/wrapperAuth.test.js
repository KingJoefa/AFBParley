const { checkWrapperAuth } = require('../lib/wrapperAuth')

test('rejects missing auth when token is set', () => {
  const req = { headers: {} }
  const result = checkWrapperAuth(req, { headerName: 'authorization', token: 'secret' })
  expect(result.ok).toBe(false)
  expect(result.reason).toMatch(/missing/i)
})

test('accepts Bearer tokens', () => {
  const req = { headers: { authorization: 'Bearer secret' } }
  const result = checkWrapperAuth(req, { headerName: 'authorization', token: 'secret' })
  expect(result.ok).toBe(true)
})
