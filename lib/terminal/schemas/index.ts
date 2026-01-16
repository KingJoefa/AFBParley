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
