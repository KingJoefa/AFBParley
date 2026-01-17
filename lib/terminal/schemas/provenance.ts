import { z } from 'zod'
import { AgentTypeSchema } from './finding'

export const ProvenanceSchema = z.object({
  request_id: z.string(),
  prompt_hash: z.string(),
  skill_md_hashes: z.record(z.string(), z.string()),
  findings_hash: z.string(),
  data_version: z.string(),
  data_timestamp: z.number(),
  search_timestamps: z.array(z.number()),
  agents_invoked: z.array(AgentTypeSchema),
  agents_silent: z.array(AgentTypeSchema),
  cache_hits: z.number(),
  cache_misses: z.number(),
  llm_model: z.string(),
  llm_temperature: z.number(),
}).strict()

export type Provenance = z.infer<typeof ProvenanceSchema>
