import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/data/repository'
import { runActiveWeekIngestion } from '@/lib/data/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'CRON_SECRET is not configured',
    })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'POSTGRES_URL or DATABASE_URL is not configured',
    })
  }

  try {
    const summary = await runActiveWeekIngestion()
    return NextResponse.json({ status: 'completed', summary })
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Ingestion failed',
    }, { status: 500 })
  }
}
