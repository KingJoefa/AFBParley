import type { SwantailResponse } from '@/lib/swantail/schema'
import type { SignalTag } from './signals'

export type CheckState = 'booting' | 'ready' | 'degraded' | 'error'

export type ScheduleCheck = {
  state: CheckState
  games?: number
  week?: number
  season?: number
  error?: string
}

export type LinesCheck = {
  state: CheckState
  mode?: 'api' | 'fallback' | 'missing' | 'degraded'
  expectedRel?: string
  expectedAbs?: string
  error?: string
}

export type BackendCheck = {
  state: CheckState
  configured?: boolean
  probeOk?: boolean
  error?: string
}

export type PreflightChecks = {
  schedule: ScheduleCheck
  lines: LinesCheck
  backend: BackendCheck
}

export type YearWeek = { year: number; week: number }

export type PreflightStatus =
  | { state: 'booting'; checks: PreflightChecks }
  | { state: 'ready'; checks: PreflightChecks; derived: YearWeek }
  | { state: 'degraded'; checks: PreflightChecks; derived: YearWeek; reason: string }
  | { state: 'error'; checks: PreflightChecks; error: string; derived?: YearWeek }

export type BuildStatus =
  | { state: 'idle' } // no matchup set
  | { state: 'ready' } // matchup set, ready to build
  | { state: 'running'; startedAt: number }
  | { state: 'success'; receivedAt: number }
  | { state: 'error'; error: string }

export type SwantailState = {
  matchup: string
  anchor: string
  anchors: string[]
  scriptBias: string[]
  signals: SignalTag[]       // Normalized canonical tags
  signals_raw: string[]      // Original user input for display/debug
  oddsPaste: string
  data: SwantailResponse | null
  preflight: PreflightStatus
  build: BuildStatus
}

export type SwantailAction =
  | { type: 'set_matchup'; value: string }
  | { type: 'set_anchor'; value: string }
  | { type: 'set_anchors'; values: string[] }
  | { type: 'set_script_bias'; values: string[] }
  | { type: 'set_signals'; signals: SignalTag[]; raw: string[] }
  | { type: 'set_odds'; value: string }
  | { type: 'set_data'; value: SwantailResponse | null }
  | { type: 'set_preflight'; value: PreflightStatus }
  | { type: 'set_build'; value: BuildStatus }

export const initialSwantailState: SwantailState = {
  matchup: '',
  anchor: '',
  anchors: [],
  scriptBias: [],
  signals: [],
  signals_raw: [],
  oddsPaste: '',
  data: null,
  preflight: {
    state: 'booting',
    checks: {
      schedule: { state: 'booting' },
      lines: { state: 'booting' },
      backend: { state: 'booting' },
    },
  },
  build: { state: 'idle' },
}

export function swantailReducer(state: SwantailState, action: SwantailAction): SwantailState {
  switch (action.type) {
    case 'set_matchup':
      return { ...state, matchup: action.value }
    case 'set_anchor':
      return { ...state, anchor: action.value }
    case 'set_anchors':
      return { ...state, anchors: action.values, anchor: action.values.join(' + ') }
    case 'set_script_bias':
      return { ...state, scriptBias: action.values }
    case 'set_signals':
      return { ...state, signals: action.signals, signals_raw: action.raw }
    case 'set_odds':
      return { ...state, oddsPaste: action.value }
    case 'set_data':
      return { ...state, data: action.value }
    case 'set_preflight':
      return { ...state, preflight: action.value }
    case 'set_build':
      return { ...state, build: action.value }
    default:
      return state
  }
}
