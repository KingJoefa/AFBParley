/**
 * Terminal Run State
 *
 * Shared state model for agent orchestration across Prop/Story/Parlay actions.
 * The terminal renders agent cards from this state without branching on action type.
 */

import type { AgentType } from './schemas/finding'

// Run modes map to terminal actions
export type RunMode = 'prop' | 'story' | 'parlay'

// Agent status within a run
export type AgentRunStatus = 'idle' | 'scanning' | 'found' | 'silent' | 'error'

// Per-agent state during a run
export type AgentRunState = {
  id: AgentType
  status: AgentRunStatus
  findings?: number
  error?: string
}

// Overall run state
export type RunPhase = 'idle' | 'scanning' | 'analyzing' | 'complete' | 'error'

export type RunState = {
  phase: RunPhase
  mode: RunMode | null
  agents: AgentRunState[]
  startedAt?: number
  completedAt?: number
  error?: string
}

// All agent types
export const ALL_AGENT_IDS: AgentType[] = ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te']

// Agent display metadata
export const AGENT_META: Record<AgentType, { label: string; icon: string; description: string }> = {
  epa: { label: 'EPA', icon: '📊', description: 'Expected Points Added analysis' },
  pressure: { label: 'Pressure', icon: '💨', description: 'Pass rush and protection metrics' },
  weather: { label: 'Weather', icon: '🌤️', description: 'Game conditions impact' },
  qb: { label: 'QB', icon: '🎯', description: 'Quarterback performance signals' },
  hb: { label: 'HB', icon: '🏃', description: 'Halfback usage and efficiency' },
  wr: { label: 'WR', icon: '📡', description: 'Wide receiver target patterns' },
  te: { label: 'TE', icon: '🔒', description: 'Tight end coverage opportunities' },
}

// Initial state factory
export function createInitialRunState(): RunState {
  return {
    phase: 'idle',
    mode: null,
    agents: ALL_AGENT_IDS.map(id => ({ id, status: 'idle' as AgentRunStatus })),
  }
}

// State transitions
export function startRun(state: RunState, mode: RunMode): RunState {
  return {
    ...state,
    phase: 'scanning',
    mode,
    startedAt: Date.now(),
    completedAt: undefined,
    error: undefined,
    agents: ALL_AGENT_IDS.map(id => ({ id, status: 'scanning' as AgentRunStatus })),
  }
}

export function updateAgent(state: RunState, agentId: AgentType, status: AgentRunStatus, findings?: number): RunState {
  return {
    ...state,
    agents: state.agents.map(a =>
      a.id === agentId ? { ...a, status, findings } : a
    ),
  }
}

export function completeRun(state: RunState): RunState {
  return {
    ...state,
    phase: 'complete',
    completedAt: Date.now(),
  }
}

export function errorRun(state: RunState, error: string): RunState {
  return {
    ...state,
    phase: 'error',
    error,
    completedAt: Date.now(),
  }
}

export function resetRun(): RunState {
  return createInitialRunState()
}
