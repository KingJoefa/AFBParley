/**
 * BYOA (Bring Your Own Analytics) Context Builder
 * Handles user-provided data with aggressive sanitization.
 *
 * SECURITY: All user data is:
 * 1. Sanitized to remove potential injection vectors
 * 2. Marked as UNTRUSTED in the context
 * 3. Never stored on server (request-scoped via client state)
 */

import { UserDataContext } from './types'

// Maximum characters for user data
const MAX_BYOA_CHARS = 2000

/**
 * Sanitize user-provided content to prevent injection attacks
 */
export function sanitizeBYOA(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''

  return raw
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip potential JSON injection (curly braces with content)
    .replace(/\{[^{}]*\}/g, '[data]')
    // Strip context delimiters that could confuse the model
    .replace(/<<[^>]*>>/g, '')
    // Strip control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Strip multiple consecutive spaces
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
    // Hard cap on length
    .slice(0, MAX_BYOA_CHARS)
}

/**
 * Create a BYOA context block from user-provided data
 * Always marked as UNTRUSTED
 */
export function createBYOAContext(rawUserData: string): UserDataContext | null {
  const sanitized = sanitizeBYOA(rawUserData)

  // Skip if empty after sanitization
  if (!sanitized || sanitized.length < 10) return null

  return {
    type: 'user_data',
    status: 'UNTRUSTED',
    note: 'User-provided data, may be inaccurate',
    data: sanitized,
  }
}

/**
 * Validate that user data is safe to include
 * Returns validation result with reason if invalid
 */
export function validateBYOA(raw: string): { valid: boolean; reason?: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, reason: 'Empty or invalid input' }
  }

  if (raw.length > MAX_BYOA_CHARS * 2) {
    return { valid: false, reason: `Content too large (max ${MAX_BYOA_CHARS} chars after sanitization)` }
  }

  // Check for obvious attack patterns
  const suspiciousPatterns = [
    /javascript:/i,
    /data:text\/html/i,
    /<script/i,
    /on\w+\s*=/i, // onclick=, onload=, etc.
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(raw)) {
      return { valid: false, reason: 'Potentially unsafe content detected' }
    }
  }

  return { valid: true }
}

/**
 * Estimate token count for BYOA data
 */
export function estimateBYOATokens(raw: string): number {
  const sanitized = sanitizeBYOA(raw)
  // Rough estimate: 4 chars per token + overhead for JSON wrapper
  return Math.ceil(sanitized.length / 4) + 20
}
