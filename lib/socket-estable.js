import { metadataEnCache } from './group-meta-cache.js'

/**
 * Ajustes comunes del socket para que el principal y los sub-bots
 * no se traguen historial, estados ni sesiones recreadas a cada rato.
 */
export function conSocketEstable(opciones = {}) {
  return {
    ...opciones,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    keepAliveIntervalMs: 20_000,
    defaultQueryTimeoutMs: 20_000,
    connectTimeoutMs: opciones.connectTimeoutMs || 25_000,
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 3,
    enableAutoSessionRecreation: true,
    shouldSyncHistoryMessage: () => false,
    transactionOpts: { maxCommitRetries: 4, delayBetweenTriesMs: 1500 },
    cachedGroupMetadata: async (jid) => metadataEnCache(jid) || undefined,
    getMessage: opciones.getMessage || (async () => undefined),
  }
}
