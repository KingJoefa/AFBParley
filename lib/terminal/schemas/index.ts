// Evidence types with discriminated union
export {
  EvidenceSchema,
  LocalEvidenceSchema,
  WebEvidenceSchema,
  LineEvidenceSchema,
  isLineEvidence,
  type Evidence,
  type LocalEvidence,
  type WebEvidence,
  type LineEvidence,
} from './evidence'

// Finding - the ONLY raw input to analyst
export {
  FindingSchema,
  AgentTypeSchema,
  type Finding,
  type AgentType,
} from './finding'

// Claim parts - structured, not free text
export {
  ClaimPartsSchema,
  MetricSchema,
  renderClaim,
  type ClaimParts,
} from './claim'

// Implications - per-agent enums for deterministic validation
export {
  EpaImplicationSchema,
  PressureImplicationSchema,
  WeatherImplicationSchema,
  QbImplicationSchema,
  HbImplicationSchema,
  WrImplicationSchema,
  TeImplicationSchema,
  NotesImplicationSchema,
  AnyImplicationSchema,
  IMPLICATION_SCHEMAS,
  getImplicationSchema,
  validateImplicationsForAgent,
  type EpaImplication,
  type PressureImplication,
  type WeatherImplication,
  type QbImplication,
  type HbImplication,
  type WrImplication,
  type TeImplication,
  type NotesImplication,
  type AnyImplication,
} from './implications'

// LLM output - keyed by finding_id, NOT free-form
export {
  LLMOutputSchema,
  LLMFindingOutputSchema,
  validateLLMOutputKeys,
  type LLMOutput,
  type LLMFindingOutput,
} from './llm-output'

// Alert - assembled via merge(codeDerived, llmOutput)
export {
  AlertSchema,
  SourceSchema,
  CodeDerivedAlertFieldsSchema,
  LLMDerivedAlertFieldsSchema,
  buildCodeDerivedFields,
  assembleAlert,
  assembleAlerts,
  type Alert,
  type Source,
  type CodeDerivedAlertFields,
  type LLMDerivedAlertFields,
} from './alert'

// Provenance for reproducibility
export {
  ProvenanceSchema,
  type Provenance,
} from './provenance'

// Script - correlated parlay output from build command
export {
  LegSchema,
  CorrelationTypeSchema,
  ScriptSchema,
  BuildResultSchema,
  identifyCorrelations,
  type Leg,
  type CorrelationType,
  type Script,
  type BuildResult,
} from './script'

// Ladder - tiered prop bet output from bet command
export {
  RungSchema,
  RiskTierSchema,
  LadderSchema,
  BetResultSchema,
  organizeLadders,
  type Rung,
  type RiskTier,
  type Ladder,
  type BetResult,
} from './ladder'

// Terminal Response - unified contract for prop/story/parlay
export {
  TerminalResponseSchema,
  ResponseModeSchema,
  buildTerminalResponse,
  buildEmptyResponse,
  buildErrorResponse,
  type TerminalResponse,
  type ResponseMode,
} from './response'
