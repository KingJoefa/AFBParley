function checkWrapperAuth(req, { headerName, token }) {
  if (!token) return { ok: true }
  const raw = req.headers?.[headerName.toLowerCase()] || ''
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return { ok: false, reason: 'missing auth header' }
  if (value !== token) return { ok: false, reason: 'invalid token' }
  return { ok: true }
}

module.exports = { checkWrapperAuth }
