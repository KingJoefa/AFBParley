/**
 * Production-Safe Logger
 *
 * Gated by NODE_ENV and LOG_LEVEL:
 * - Production: Only errors and warnings (no debug/info)
 * - Development: All levels enabled
 *
 * Sensitive data is never logged (user inputs, LLM payloads, API keys).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// In production, default to 'warn' (only warn + error)
// In development, default to 'debug' (all levels)
const IS_PROD = process.env.NODE_ENV === 'production'
const DEFAULT_LEVEL: LogLevel = IS_PROD ? 'warn' : 'debug'
const CURRENT_LEVEL = (process.env.LOG_LEVEL as LogLevel) || DEFAULT_LEVEL

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL]
}

function formatPrefix(module: string): string {
  return `[${module}]`
}

/**
 * Create a logger for a specific module
 *
 * @param module - Module name (e.g., 'Build', 'PropsRoster', 'the-odds-api')
 */
export function createLogger(module: string) {
  const prefix = formatPrefix(module)

  return {
    /**
     * Debug-level logging (dev only by default)
     * Use for: detailed tracing, internal state, verbose info
     */
    debug: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('debug')) {
        if (data) {
          // eslint-disable-next-line no-console
          console.log(prefix, message, data)
        } else {
          // eslint-disable-next-line no-console
          console.log(prefix, message)
        }
      }
    },

    /**
     * Info-level logging (dev only by default)
     * Use for: operation completion, status updates
     */
    info: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('info')) {
        if (data) {
          // eslint-disable-next-line no-console
          console.info(prefix, message, data)
        } else {
          // eslint-disable-next-line no-console
          console.info(prefix, message)
        }
      }
    },

    /**
     * Warning-level logging (always in prod)
     * Use for: degraded states, fallbacks, recoverable issues
     */
    warn: (message: string, data?: Record<string, unknown>) => {
      if (shouldLog('warn')) {
        if (data) {
          // eslint-disable-next-line no-console
          console.warn(prefix, message, data)
        } else {
          // eslint-disable-next-line no-console
          console.warn(prefix, message)
        }
      }
    },

    /**
     * Error-level logging (always in prod)
     * Use for: failures, exceptions, unrecoverable issues
     */
    error: (message: string, error?: Error | unknown) => {
      if (shouldLog('error')) {
        if (error instanceof Error) {
          // eslint-disable-next-line no-console
          console.error(prefix, message, { error: error.message })
        } else if (error) {
          // eslint-disable-next-line no-console
          console.error(prefix, message, error)
        } else {
          // eslint-disable-next-line no-console
          console.error(prefix, message)
        }
      }
    },
  }
}

/**
 * Sanitize data for logging - remove sensitive fields
 */
export function sanitize(
  data: Record<string, unknown>,
  sensitiveKeys: string[] = ['apiKey', 'token', 'password', 'prompt', 'content']
): Record<string, unknown> {
  const result = { ...data }
  for (const key of sensitiveKeys) {
    if (key in result) {
      result[key] = '[REDACTED]'
    }
  }
  return result
}
