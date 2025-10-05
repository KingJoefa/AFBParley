import { NextResponse } from "next/server"

const FOCUS_KEYS = [
  "pace",
  "redzone",
  "explosive",
  "pressure",
  "ol_dl",
  "weather",
  "injuries",
]

export async function GET() {
  const availability = FOCUS_KEYS.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = false
    return acc
  }, {})

  return NextResponse.json({
    weekId: "current",
    availability,
    availableKeys: [],
  })
}
