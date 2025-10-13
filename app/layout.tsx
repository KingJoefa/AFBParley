import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: 'ParlayGPT • AFB Builder',
  description: 'Craft winning football parlay scripts with AI-powered analytics. Discover matchup stories and reveal your best plays using advanced betting insights.',
  openGraph: {
    title: 'ParlayGPT • AFB Builder',
    description: 'AI-powered football parlay builder using advanced analytics to uncover matchup stories, data-driven edges, and winning betting scripts.'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ParlayGPT • AFB Builder',
    description: 'AI-powered football parlay builder using advanced analytics to uncover matchup stories, data-driven edges, and winning betting scripts.'
  }
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


