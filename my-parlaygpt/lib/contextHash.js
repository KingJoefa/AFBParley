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
