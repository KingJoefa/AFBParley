import { z } from 'zod'

// Base evidence fields shared by all evidence types
const BaseEvidenceFields = {
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  comparison: z.string(),
  source_ref: z.string(),
  quote_snippet: z.string().optional(),
}

// Standard evidence (local or web source)
export const LocalEvidenceSchema = z.object({
  ...BaseEvidenceFields,
  source_type: z.literal('local'),
}).strict()

export const WebEvidenceSchema = z.object({
  ...BaseEvidenceFields,
  source_type: z.literal('web'),
  quote_snippet: z.string(), // Required for web
}).strict()

// Line evidence with betting-specific fields
export const LineEvidenceSchema = z.object({
  ...BaseEvidenceFields,
  source_type: z.literal('line'),
  line_type: z.enum(['spread', 'total', 'prop', 'moneyline']),
  line_value: z.number(),
  line_odds: z.number(),
  book: z.string(),
  line_timestamp: z.number(),
  line_ttl: z.number(),
}).strict()

// Discriminated union by source_type
export const EvidenceSchema = z.discriminatedUnion('source_type', [
  LocalEvidenceSchema,
  WebEvidenceSchema,
  LineEvidenceSchema,
])

export type LocalEvidence = z.infer<typeof LocalEvidenceSchema>
export type WebEvidence = z.infer<typeof WebEvidenceSchema>
export type LineEvidence = z.infer<typeof LineEvidenceSchema>
export type Evidence = z.infer<typeof EvidenceSchema>

// Type guard for LineEvidence
export function isLineEvidence(e: Evidence): e is LineEvidence {
  return e.source_type === 'line'
}
