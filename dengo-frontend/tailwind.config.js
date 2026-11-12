/** @type {import('tailwindcss').Config} */

// Brand blue (Tailwind blue, the POS's original colour). `primary` reads CSS
// variables (index.css) so Configuración → Apariencia can swap it at runtime —
// see lib/theme.ts. These keys only define which shades exist.
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

// Soft shadows with a y-offset (a little lift, not a halo).
const shade = (a) => `rgb(15 23 42 / ${a})`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Settings cards derive text-* from their bg-* colour at runtime.
  safelist: [
    { pattern: /^(bg|text)-(blue|purple|green|orange|cyan|amber|lime|teal|yellow|pink|indigo|gray|sky|violet|emerald)-(500|600)$/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        sm: `0 1px 2px 0 ${shade(0.05)}`,
        DEFAULT: `0 1px 3px 0 ${shade(0.08)}, 0 1px 2px -1px ${shade(0.06)}`,
        md: `0 6px 14px -4px ${shade(0.10)}, 0 2px 4px -2px ${shade(0.06)}`,
        lg: `0 14px 28px -8px ${shade(0.14)}, 0 4px 8px -4px ${shade(0.06)}`,
        xl: `0 22px 44px -12px ${shade(0.20)}, 0 8px 16px -8px ${shade(0.08)}`,
        '2xl': `0 28px 56px -16px ${shade(0.30)}`,
      },
      colors: {
        primary: Object.fromEntries(SHADES.map(k => [k, `rgb(var(--primary-${k}) / <alpha-value>)`])),
        // Second brand colour (logo gradient, accents). Was red, which read as
        // "error" everywhere it appeared; violet sits next to the blue instead.
        secondary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        // Icon micro-motion on hover (used with group-hover + motion-safe)
        wiggle: 'wiggle 0.5s ease-in-out',
        pop: 'pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-x': 'bounceX 0.6s ease-in-out',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%': { transform: 'rotate(-12deg)' },
          '40%': { transform: 'rotate(10deg)' },
          '60%': { transform: 'rotate(-6deg)' },
          '80%': { transform: 'rotate(3deg)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1.08)' },
        },
        bounceX: {
          '0%, 100%': { transform: 'translateX(0)' },
          '40%': { transform: 'translateX(4px)' },
          '70%': { transform: 'translateX(-1px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
}
