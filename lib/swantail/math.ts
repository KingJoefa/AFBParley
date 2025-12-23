export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0
  if (american > 0) return 1 + american / 100
  return 1 + 100 / Math.abs(american)
}

function round(value: number, decimals: number) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export type ParlayMath = {
  stake: number
  leg_decimals: number[]
  product_decimal: number
  payout: number
  profit: number
  steps: string
}

export function computeParlayMath(americanOdds: number[]): ParlayMath {
  const decimalsRaw = americanOdds.map(americanToDecimal)
  const legDecimals = decimalsRaw.map(d => round(d, 2))
  const productRaw = legDecimals.reduce((acc, d) => acc * d, 1)
  const productDecimal = round(productRaw, 2)
  const payout = round(productDecimal * 1, 2)
  const profit = round(payout - 1, 2)
  const steps = `${legDecimals.map(d => d.toFixed(2)).join(' × ')} = ${productDecimal.toFixed(2)}; payout $${payout.toFixed(2)}, profit $${profit.toFixed(2)}`

  return {
    stake: 1,
    leg_decimals: legDecimals,
    product_decimal: productDecimal,
    payout,
    profit,
    steps
  }
}

export function mathDiffers(a: ParlayMath, b: ParlayMath): boolean {
  const delta = (x: number, y: number) => Math.abs(x - y)
  return (
    delta(a.product_decimal, b.product_decimal) > 0.02 ||
    delta(a.payout, b.payout) > 0.02 ||
    delta(a.profit, b.profit) > 0.02
  )
}
