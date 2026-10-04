const patchedCiphers = new WeakSet()

function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve))
}

export function yieldBetweenSignalDecryptAttempts(SessionCipher) {
  const prototype = SessionCipher?.prototype
  if (!prototype || patchedCiphers.has(SessionCipher)) return false

  const decryptWithSessions = prototype.decryptWithSessions
  const decryptWhisperMessage = prototype.doDecryptWhisperMessage
  if (typeof decryptWithSessions !== 'function' || typeof decryptWhisperMessage !== 'function') {
    throw new TypeError('La implementación de libsignal no expone los métodos de descifrado esperados.')
  }

  const attemptsByCipher = new WeakMap()
  prototype.decryptWithSessions = async function (data, sessions) {
    if (!Array.isArray(sessions) || sessions.length < 2) {
      return decryptWithSessions.call(this, data, sessions)
    }

    attemptsByCipher.set(this, 0)
    try {
      return await decryptWithSessions.call(this, data, sessions)
    } finally {
      attemptsByCipher.delete(this)
    }
  }

  prototype.doDecryptWhisperMessage = async function (...args) {
    const attempts = attemptsByCipher.get(this)
    if (attempts !== undefined) {
      if (attempts > 0) await yieldToEventLoop()
      attemptsByCipher.set(this, attempts + 1)
    }
    return decryptWhisperMessage.apply(this, args)
  }

  patchedCiphers.add(SessionCipher)
  return true
}
