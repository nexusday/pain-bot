import { metadataEnCache } from './group-meta-cache.js'

/**
 * Opciones que evitan que el socket se corte cuando hay muchos sub-bots.
 * El ping aguanta un hueco de ~65s y las consultas de WhatsApp no se quedan
 * colgadas un minuto.
 */
export function conSocketEstable(opciones = {}) {
  return {
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    ...opciones,
    keepAliveIntervalMs: 60_000,
    defaultQueryTimeoutMs: 20_000,
    connectTimeoutMs: opciones.connectTimeoutMs || 25_000,
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 3,
    transactionOpts: { maxCommitRetries: 4, delayBetweenTriesMs: 1500 },
    cachedGroupMetadata: async (jid) => metadataEnCache(jid) || undefined,
  }
}
