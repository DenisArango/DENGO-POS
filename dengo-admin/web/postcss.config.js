import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'

export default { plugins: [tailwind({ config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) }), autoprefixer] }
