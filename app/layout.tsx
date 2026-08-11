import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'Swantail | Game Script Terminal',
  description: 'Build causal football game scripts from matchup-specific Game Agents and outcome anchors.',
  openGraph: {
    title: 'Swantail | Game Script Terminal',
    description: 'Build causal football game scripts from matchup-specific Game Agents and outcome anchors.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Swantail | Game Script Terminal',
    description: 'Build causal football game scripts from matchup-specific Game Agents and outcome anchors.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

