/** @type {import('tailwindcss').Config} */
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
      }
    }
  },
  plugins: []
}
