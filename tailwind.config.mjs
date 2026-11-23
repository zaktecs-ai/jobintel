/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#12141a',
          700: '#333844',
          500: '#616775',
          400: '#8b91a0',
          300: '#adb3c0',
        },
        surface: {
          0: '#ffffff',
          50: '#fbfbfd',
          100: '#f5f6f9',
          200: '#eceef3',
          300: '#e0e3ea',
        },
        accent: {
          50: '#eef4ff',
          100: '#dbe7ff',
          400: '#5b8cf5',
          500: '#3366e0',
          600: '#2451c4',
          700: '#1b3f9e',
        },
        moss: {
          500: '#0f9d6e',
          100: '#d9f5ea',
        },
        ember: {
          500: '#d9542b',
          100: '#fdeae3',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,20,26,0.04), 0 8px 24px -12px rgba(18,20,26,0.12)',
        lift: '0 2px 4px rgba(18,20,26,0.05), 0 18px 40px -18px rgba(18,20,26,0.22)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.9)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-480px 0' },
          '100%': { backgroundPosition: '480px 0' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slidein: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulsedot: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.85)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        rise: 'rise 0.34s cubic-bezier(0.22,1,0.36,1) both',
        slidein: 'slidein 0.3s cubic-bezier(0.22,1,0.36,1) both',
        pulsedot: 'pulsedot 1.4s ease-in-out infinite',
        sweep: 'sweep 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
