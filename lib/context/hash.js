const crypto = require('crypto')

const CONTEXT_VERSION = 'v1'

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

function canonicalizeContextPayload(payload) {
  return JSON.stringify(canonicalize(payload))
}

function hashContextPayload(payload) {
  const json = canonicalizeContextPayload(payload)
  return crypto.createHash('sha256').update(json).digest('hex')
}

module.exports = {
  CONTEXT_VERSION,
  canonicalizeContextPayload,
  hashContextPayload,
}
