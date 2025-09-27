import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ParlayGPT • AFB Builder',
  description: 'Assisted Builder for correlated parlay scripts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
      </body>
    </html>
  )
}


