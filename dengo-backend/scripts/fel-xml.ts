// Baja el XML certificado de un DTE y muestra cómo lo lee DENGO (lib/fel/dte-xml.ts).
//   npx tsx scripts/fel-xml.ts <autorización> [--raw]
import '../src/config.js'
import { felConfig } from '../src/lib/fel/config.js'
import { getProvider, contextFor } from '../src/lib/fel/service.js'
import { parseDte } from '../src/lib/fel/dte-xml.js'

const uuid = process.argv[2]
if (!uuid) { console.error('Uso: npx tsx scripts/fel-xml.ts <autorización> [--raw]'); process.exit(1) }
const cfg = felConfig(process.env)
const p = getProvider(cfg)
const ctx = contextFor({}, cfg)
if (!p?.xml || !ctx) { console.error('El certificador configurado no entrega XML'); process.exit(1) }
const xml = await p.xml(uuid, ctx)
if (!xml) { console.error('No se encontró el documento'); process.exit(1) }
if (process.argv.includes('--raw')) console.log(xml)
else console.log(JSON.stringify(parseDte(xml), null, 2))
process.exit(0)
