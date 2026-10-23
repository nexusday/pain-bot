import crypto from 'node:crypto'

export const RPC_REQUEST = 'pain-panel-rpc'
export const RPC_RESPONSE = 'pain-panel-rpc-result'

export function createRpcClient(channel, { limit = 16, timeoutMs = 45_000 } = {}) {
  const pending = new Map()
  const fail = () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(Object.assign(new Error('El proceso del bot no está disponible.'), { code: 'runtime_unavailable' }))
    }
    pending.clear()
  }
  const onMessage = (message) => {
    if (message?.type !== RPC_RESPONSE) return
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    clearTimeout(item.timer)
    if (message.error) {
      item.reject(Object.assign(new Error(message.error.message), {
        code: message.error.code, remoteType: message.error.type,
      }))
    } else item.resolve(message.result)
  }
  channel.on('message', onMessage)
  channel.on('disconnect', fail)
  return {
    call(method, ...args) {
      if (!channel.connected) return Promise.reject(Object.assign(new Error('El proceso del bot no está disponible.'), { code: 'runtime_unavailable' }))
      if (pending.size >= limit) return Promise.reject(Object.assign(new Error('Hay operaciones del bot en curso. Intenta de nuevo en unos segundos.'), { code: 'runtime_busy' }))
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID()
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(Object.assign(new Error('La operación del bot superó el tiempo de espera.'), { code: 'runtime_timeout' }))
        }, timeoutMs)
        timer.unref?.()
        pending.set(id, { resolve, reject, timer })
        const failed = (error) => {
          if (!error || !pending.has(id)) return
          pending.delete(id)
          clearTimeout(timer)
          reject(Object.assign(new Error('No se pudo comunicar con el proceso del bot.'), { code: 'runtime_unavailable' }))
        }
        try { channel.send({ type: RPC_REQUEST, id, method, args }, failed) } catch (error) { failed(error) }
      })
    },
    close() {
      channel.off('message', onMessage)
      channel.off('disconnect', fail)
      fail()
    },
  }
}

/** Solo métodos enumerados: nunca nombres globales, eval, rutas o comandos libres. */
export function serveRpc(channel, handlers, { limit = 8 } = {}) {
  let active = 0
  const reply = (message) => {
    if (channel.connected) {
      try { channel.send(message, () => {}) } catch {}
    }
  }
  const onMessage = async (message) => {
    if (message?.type !== RPC_REQUEST || typeof message.id !== 'string' || message.id.length > 64) return
    const response = { type: RPC_RESPONSE, id: message.id }
    if (typeof message.method !== 'string' || !Object.hasOwn(handlers, message.method) || !Array.isArray(message.args) ||
        message.args.length > 4 || JSON.stringify(message).length > 32_768) {
      reply({ ...response, error: { code: 'runtime_invalid', message: 'Operación no permitida.' } })
      return
    }
    if (active >= limit) {
      reply({ ...response, error: { code: 'runtime_busy', message: 'El bot tiene operaciones en curso. Intenta de nuevo en unos segundos.' } })
      return
    }
    active++
    try {
      reply({ ...response, result: await handlers[message.method](...message.args) })
    } catch (error) {
      const known = ['PairingError', 'MainBotError'].includes(error?.constructor?.name)
      if (!known) console.error('[webpanel-runtime]', error?.message || error)
      reply({ ...response, error: {
        code: known ? error.code : 'runtime_unavailable',
        type: error?.constructor?.name,
        message: known ? String(error.message).slice(0, 300) : 'La operación del bot no está disponible en este momento.',
      } })
    } finally { active-- }
  }
  channel.on('message', onMessage)
  return () => channel.off('message', onMessage)
}
