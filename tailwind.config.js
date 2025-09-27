/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Black + Silver Professional Palette
        primary: {
          50: '#F8F9FA',   // Light silver
          100: '#E9ECEF',  // Lighter silver
          200: '#DEE2E6',  // Light silver
          300: '#CED4DA',  // Silver
          400: '#ADB5BD',  // Medium silver
          500: '#6C757D',  // Dark silver
          600: '#495057',  // Darker silver
          700: '#343A40',  // Dark gray
          800: '#212529',  // Very dark gray
          900: '#000000',  // Pure black
        },
        accent: {
          silver: '#C0C0C0',      // Base silver
          chrome: '#E5E5E5',      // Light chrome
          platinum: '#E8E8E8',    // Platinum
          steel: '#A8A8A8',       // Steel gray
          gunmetal: '#2C3E50',    // Dark gunmetal
        },
        background: {
          primary: '#000000',     // Pure black
          secondary: '#111111',   // Near black
          tertiary: '#1A1A1A',    // Dark charcoal
          card: '#0F0F0F',        // Card background
        },
        text: {
          primary: '#E0E0E0',     // Light gray text
          secondary: '#C0C0C0',   // Medium gray text
          accent: '#FFFFFF',      // Pure white for emphasis
          muted: '#8A8A8A',       // Muted gray
        },
        border: {
          silver: '#C0C0C0',      // Silver borders
          subtle: '#333333',      // Subtle dark borders
          glow: '#E5E5E5',        // Glow effect
        }
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        'display': ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'silver-glow': '0 0 20px rgba(192, 192, 192, 0.3)',
        'silver-soft': '0 4px 14px 0 rgba(192, 192, 192, 0.15)',
        'metallic': '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'silver-gradient': 'linear-gradient(135deg, #C0C0C0 0%, #E5E5E5 50%, #C0C0C0 100%)',
        'metallic-gradient': 'linear-gradient(145deg, #1A1A1A 0%, #2D2D2D 50%, #1A1A1A 100%)',
        'chrome-gradient': 'linear-gradient(to bottom, #E5E5E5 0%, #C0C0C0 50%, #A8A8A8 100%)',
        'dark-metallic': 'linear-gradient(135deg, #000000 0%, #1A1A1A 50%, #000000 100%)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'silver-pulse': 'silver-pulse 2s ease-in-out infinite',
        'metallic-shimmer': 'metallic-shimmer 3s ease-in-out infinite',
      },
      keyframes: {
        'silver-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(192, 192, 192, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(192, 192, 192, 0.5)' },
        },
        'metallic-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}