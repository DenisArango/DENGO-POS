/** @type {import('tailwindcss').Config} */

// Shadows tinted from the neutral ink, always with a y-offset and soft blur.
const shade = (a) => `rgb(15 23 42 / ${a})`

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS variables (index.css) so the client's own colour can replace
        // them at runtime — see lib/brand.ts.
        brand: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(s => [s, `rgb(var(--brand-${s}) / <alpha-value>)`])
        ),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        wiggle: 'wiggle 0.5s ease-in-out',
        pop: 'pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-x': 'bounceX 0.6s ease-in-out',
        float: 'float 4s ease-in-out infinite',
      },
      keyframes: {
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
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      boxShadow: {
        sm: `0 1px 2px 0 ${shade(0.05)}`,
        DEFAULT: `0 1px 3px 0 ${shade(0.07)}, 0 1px 2px -1px ${shade(0.05)}`,
        md: `0 4px 10px -2px ${shade(0.08)}, 0 2px 4px -2px ${shade(0.05)}`,
        lg: `0 12px 24px -6px ${shade(0.12)}, 0 4px 8px -4px ${shade(0.06)}`,
        xl: `0 20px 40px -12px ${shade(0.18)}, 0 8px 16px -8px ${shade(0.08)}`,
        '2xl': `0 28px 56px -16px ${shade(0.28)}`,
      },
    }
  },
  plugins: []
}
