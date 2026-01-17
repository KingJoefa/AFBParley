/**
 * Terminal Feature Flags
 *
 * Control availability of terminal actions.
 * These can be toggled via environment variables or hardcoded for rollout.
 */

export interface TerminalFeatureFlags {
  // Action flags
  propEnabled: boolean
  storyEnabled: boolean
  parlayEnabled: boolean

  // Data flags
  liveDataEnabled: boolean // Use real data vs mock
  llmAnalystEnabled: boolean // Use LLM vs fallback

  // UI flags
  agentCardsEnabled: boolean // Show agent status cards
  scriptsMetadataEnabled: boolean // Include scripts in response
}

/**
 * Default flags - can be overridden by environment variables
 */
function getFlags(): TerminalFeatureFlags {
  const envOrDefault = (key: string, defaultValue: boolean): boolean => {
    const env = process.env[key]
    if (env === undefined) return defaultValue
    return env === 'true' || env === '1'
  }

  return {
    // Action flags - all enabled by default
    propEnabled: envOrDefault('TERMINAL_PROP_ENABLED', true),
    storyEnabled: envOrDefault('TERMINAL_STORY_ENABLED', true),
    parlayEnabled: envOrDefault('TERMINAL_PARLAY_ENABLED', true),

    // Data flags
    liveDataEnabled: envOrDefault('TERMINAL_LIVE_DATA', false), // Default to mock
    llmAnalystEnabled: envOrDefault('TERMINAL_LLM_ANALYST', true),

    // UI flags
    agentCardsEnabled: envOrDefault('TERMINAL_AGENT_CARDS', true),
    scriptsMetadataEnabled: envOrDefault('TERMINAL_SCRIPTS_METADATA', true),
  }
}

// Export singleton
export const TERMINAL_FLAGS = getFlags()

/**
 * Check if an action is enabled
 */
export function isActionEnabled(action: 'prop' | 'story' | 'parlay'): boolean {
  switch (action) {
    case 'prop':
      return TERMINAL_FLAGS.propEnabled
    case 'story':
      return TERMINAL_FLAGS.storyEnabled
    case 'parlay':
      return TERMINAL_FLAGS.parlayEnabled
  }
}

/**
 * Get all enabled actions
 */
export function getEnabledActions(): ('prop' | 'story' | 'parlay')[] {
  const actions: ('prop' | 'story' | 'parlay')[] = []
  if (TERMINAL_FLAGS.propEnabled) actions.push('prop')
  if (TERMINAL_FLAGS.storyEnabled) actions.push('story')
  if (TERMINAL_FLAGS.parlayEnabled) actions.push('parlay')
  return actions
}

/**
 * Check if feature is in beta (for UI indicators)
 */
export function isBeta(action: 'prop' | 'story' | 'parlay'): boolean {
  // Currently all actions are in beta
  return true
}
