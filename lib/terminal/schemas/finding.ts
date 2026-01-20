import { z } from 'zod'

export const AgentTypeSchema = z.enum(['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te', 'notes'])
export type AgentType = z.infer<typeof AgentTypeSchema>

export const FindingSchema = z.object({
  id: z.string(),
  agent: AgentTypeSchema,
  type: z.string(),
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  threshold_met: z.string(),
  comparison_context: z.string(),
  source_ref: z.string(),
  source_type: z.enum(['local', 'web', 'notes']),
  source_timestamp: z.number(),
  quote_snippet: z.string().optional(),
  // Extended fields for NotesAgent (optional, additive to base schema)
  confidence: z.number().min(0).max(1).optional(),
  raw_text: z.string().optional(),
  players_mentioned: z.array(z.string()).optional(),
}).strict()

export type Finding = z.infer<typeof FindingSchema>
