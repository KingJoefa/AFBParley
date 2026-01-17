'use client'

import { Terminal } from '@/components/terminal'
import { useCallback } from 'react'

export default function TerminalPage() {
  // Handler for matchup scanning
  const handleMatchup = useCallback(async (away: string, home: string) => {
    try {
      const response = await fetch('/api/terminal/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: `${away} @ ${home}` }),
      })

      const data = await response.json()

      // TODO: Display findings/alerts in terminal
      console.log('Scan result:', data)
    } catch (error) {
      console.error('Scan failed:', error)
      throw error
    }
  }, [])

  // Handler for building parlays
  const handleBuild = useCallback(async (args: string[], flags: Record<string, string | boolean>) => {
    try {
      // TODO: Get alerts from previous scan and call /api/terminal/build
      console.log('Build requested with args:', args, 'flags:', flags)
    } catch (error) {
      console.error('Build failed:', error)
      throw error
    }
  }, [])

  // Handler for betting ladders
  const handleBet = useCallback(async (args: string[], flags: Record<string, string | boolean>) => {
    try {
      // TODO: Get alerts from previous scan and call /api/terminal/bet
      console.log('Bet requested with args:', args, 'flags:', flags)
    } catch (error) {
      console.error('Bet failed:', error)
      throw error
    }
  }, [])

  return (
    <main className="h-screen w-screen overflow-hidden bg-terminal-bg">
      <Terminal
        onMatchup={handleMatchup}
        onBuild={handleBuild}
        onBet={handleBet}
      />
    </main>
  )
}
