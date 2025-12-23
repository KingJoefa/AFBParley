export default function SwantailLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} aria-hidden>
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="swantail-grad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="url(#swantail-grad)" fillOpacity="0.15" stroke="#7DD3FC" strokeOpacity="0.4" />
        <path
          d="M16.5 28.5C20 30.8 27.5 31.2 31.8 27.8C34.1 26 34.3 22.3 30.8 21.2C27.1 20 24.2 22.4 21.4 23.8C19.4 24.8 17.4 25.2 15.2 24.9"
          stroke="url(#swantail-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22 18.8C23.4 17.6 24.8 16.6 26.4 15.8C29.2 14.3 32.4 14.2 35 15.4"
          stroke="#7DD3FC"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.8 22.2C18.2 20.6 18.9 19.2 20 18"
          stroke="#7DD3FC"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M28.5 29.5C30.2 31.8 32.6 33.2 35.8 33.8"
          stroke="#22D3EE"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
