// Prueba rápida de las credenciales de FELplex (no certifica nada).
import { felConfig } from '../src/lib/fel/config.js'
import { felplexProvider } from '../src/lib/fel/providers/felplex.js'
const cfg = felConfig(process.env)
const p = felplexProvider(cfg)
const ctx = { entityId: cfg.defaultEntityId! } as any
console.log('URL:', cfg.baseUrl, '· empresa:', ctx.entityId)
try { console.log('Créditos DTE:', await p.credits(ctx)) } catch (e: any) { console.log('Créditos ERROR:', e.message) }
const nit = process.argv[2] ?? '2967049'
try { console.log('NIT', nit, '→', await p.lookupTaxId('NIT', nit, ctx)) } catch (e: any) { console.log('NIT ERROR:', e.message) }
