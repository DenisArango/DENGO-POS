import { loadConfig, readDotEnv } from './config.js'
import { buildApp } from './app.js'
import { allRoutes } from './routes/index.js'

// a variable already in the environment wins over the .env file (like the backend's loader)
const config = loadConfig({ ...readDotEnv(), ...process.env })
const app = await buildApp(config, allRoutes)
await app.listen({ port: config.port, host: config.host })
console.log(`dengo-admin en http://${config.host}:${config.port} (${config.mode === 'simulate' ? 'SIMULACIÓN: no se ejecuta nada' : 'modo real'}) · raíz ${config.root}`)
