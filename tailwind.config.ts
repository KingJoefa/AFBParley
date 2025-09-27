import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0b10',
        foreground: '#e6e6eb',
        muted: '#8a8aa0',
        card: '#12121a',
        border: '#222232',
        accent: '#6e85ff',
        success: '#22c55e',
        danger: '#ef4444'
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.35)'
      },
      borderRadius: {
        '2xl': '1rem'
      }
    }
  },
  plugins: []
} satisfies Config


