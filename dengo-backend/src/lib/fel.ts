// Guatemala FEL (Factura Electrónica en Línea). Public entry point — the
// implementation lives in lib/fel/: providers (FELplex, simulator), the
// sale → DTE builder, and the certify / annul / credit-note / retry service.
// Configuration is per deployment, in .env (see lib/fel/config.ts and
// docs/fel/README.md).

export type { FelStatus } from './fel/types.js'
export { felConfig, felConfigSummary } from './fel/config.js'
export { buildDteForSale, lineDescription, DteBuildError } from './fel/build.js'
export {
  certifySale, voidSaleFel, refreshSaleFel, certifyCreditNote,
  retryPending, startFelWorker, getProvider, contextFor, schoolReceiver,
} from './fel/service.js'
