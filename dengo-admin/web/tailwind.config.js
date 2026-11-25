import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [here('./index.html'), here('./src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        ink: { 50: '#eef4f8', 100: '#d9e6ef', 200: '#b3cddf', 300: '#86adc7', 400: '#5a8aab', 500: '#3b6e8f', 600: '#2b5b79', 700: '#1E4D68', 800: '#173c52', 900: '#11303f', 950: '#0b1f2a' },
        coral: { 50: '#fdf3f0', 100: '#fbe3dc', 200: '#f6c4b6', 300: '#efa088', 400: '#e8886b', 500: '#E07A5F', 600: '#c95f43', 700: '#a74a33', 800: '#863d2c', 900: '#6d3428' },
        ice: '#EEF3F7',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Inter Variable"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        tile: '0 1px 0 0 rgba(255,255,255,.9) inset, 0 1px 2px rgba(17,48,63,.06), 0 6px 16px -6px rgba(17,48,63,.12), 0 18px 40px -18px rgba(17,48,63,.18)',
        lift: '0 1px 0 0 rgba(255,255,255,.9) inset, 0 2px 4px rgba(17,48,63,.07), 0 12px 24px -8px rgba(17,48,63,.18), 0 30px 60px -24px rgba(17,48,63,.28)',
        well: 'inset 0 2px 4px rgba(17,48,63,.08), inset 0 0 0 1px rgba(17,48,63,.06)',
        coral: '0 1px 0 0 rgba(255,255,255,.35) inset, 0 6px 14px -4px rgba(201,95,67,.55), 0 2px 4px rgba(201,95,67,.3)',
      },
      borderRadius: { tile: '22px' },
      keyframes: {
        ping2: { '0%': { transform: 'scale(1)', opacity: '.55' }, '80%,100%': { transform: 'scale(2.4)', opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: { ping2: 'ping2 1.8s cubic-bezier(0,0,.2,1) infinite', shimmer: 'shimmer 1.6s linear infinite' },
    },
  },
  plugins: [],
}
