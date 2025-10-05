import { z } from 'zod'

export const AfbRequestSchema = z.object({
  matchup: z.string().min(3),
  line_focus: z.string().optional(),
  angles: z.array(z.string()).optional(),
  voice: z.enum(['analyst', 'hype', 'coach']).default('analyst').optional(),
  profile: z.string().default('default').optional(),
  user_supplied_odds: z
    .array(
      z.object({
        leg: z.string().min(1),
        american_odds: z.number()
      })
    )
    .optional()
})

export type AfbRequest = z.infer<typeof AfbRequestSchema>

export const MemorySchema = z.object({
  profile: z.string().default('default'),
  memory: z.record(z.any())
})

export type MemoryBody = z.infer<typeof MemorySchema>

export type AFBVoice = "analyst" | "hype" | "coach"

export interface AFBRequest {
  matchup: string
  line_focus?: string
  angles?: string[]
  voice?: AFBVoice
  user_supplied_odds?: Array<{
    leg: string
    american_odds: number
  }>
}

export interface AFBResponse {
  text: string
}
