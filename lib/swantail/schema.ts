import { z } from 'zod'

export const SwantailLegSchema = z.object({
  market: z.string().min(1),
  selection: z.string().min(1),
  american_odds: z.number(),
  odds_source: z.enum(['illustrative', 'user_supplied'])
})

export const SwantailMathSchema = z.object({
  stake: z.number(),
  leg_decimals: z.array(z.number()),
  product_decimal: z.number(),
  payout: z.number(),
  profit: z.number(),
  steps: z.string().min(1)
})

export const SwantailScriptSchema = z.object({
  title: z.string().min(1),
  narrative: z.string().min(1),
  legs: z.array(SwantailLegSchema).min(3).max(5),
  parlay_math: SwantailMathSchema,
  notes: z.array(z.string()).min(2),
  offer_opposite: z.literal('Want the other side of this story?')
})

export const SwantailResponseSchema = z.object({
  assumptions: z.object({
    matchup: z.string().min(1),
    line_focus: z.string().optional().default(''),
    angles: z.array(z.string()).default([]),
    voice: z.enum(['analyst', 'hype', 'coach'])
  }),
  scripts: z.array(SwantailScriptSchema).min(1).max(3)
})

export type SwantailResponse = z.infer<typeof SwantailResponseSchema>
export type SwantailScript = z.infer<typeof SwantailScriptSchema>
export type SwantailLeg = z.infer<typeof SwantailLegSchema>
