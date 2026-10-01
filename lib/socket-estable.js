import { metadataEnCache } from './group-meta-cache.js'

const temporizadoresPrekeys = new WeakMap()

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
    keepAliveIntervalMs: 20_000,
    defaultQueryTimeoutMs: 20_000,
    connectTimeoutMs: opciones.connectTimeoutMs || 25_000,
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 3,
    transactionOpts: { maxCommitRetries: 4, delayBetweenTriesMs: 1500 },
    cachedGroupMetadata: async (jid) => metadataEnCache(jid) || undefined,
    getMessage: async (key) => {
      const jid = key?.remoteJid
      const id = key?.id
      if (!jid || !id) return undefined
      const sockets = [global.conn, ...(global.conns || [])]
      for (const sock of sockets) {
        const guardado = sock?.chats?.[jid]?.messages?.[id]
        if (guardado?.message) return guardado.message
      }
      return undefined
    },
  }
}

export function mantenerPrekeys(sock) {
  if (!sock?.uploadPreKeysToServerIfRequired || temporizadoresPrekeys.has(sock)) return
  const temporizador = setInterval(() => {
    sock.uploadPreKeysToServerIfRequired().catch(() => {})
  }, 6 * 60 * 60 * 1000)
  temporizador.unref?.()
  temporizadoresPrekeys.set(sock, temporizador)
}

export function detenerPrekeys(sock) {
  const temporizador = sock && temporizadoresPrekeys.get(sock)
  if (!temporizador) return
  clearInterval(temporizador)
  temporizadoresPrekeys.delete(sock)
}
