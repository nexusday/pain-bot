import assert from 'node:assert/strict'
import test from 'node:test'

test('webpanel UI: los distintivos del acceso muestran premium activos y guardados', async () => {
  const original = globalThis.document
  const elementos = {}
  globalThis.document = {
    hidden: false,
    getElementById: (id) => {
      if (!elementos[id]) elementos[id] = { innerHTML: '', style: {} }
      return elementos[id]
    },
  }
  try {
    const { state } = await import('../webpanel/public/assets/js/core.js')
    const { renderStatsBadges } = await import('../webpanel/public/assets/js/stats.js')

    state.user = null
    state.stats = {
      users: 145, bots: 64, sessionsConnected: 166, sessions: 351,
      communities: 12, premiumActive: 7, premiumSaved: 3,
    }
    renderStatsBadges()
    const html = elementos['auth-stats'].innerHTML
    assert.match(html, /<b>145<\/b> usuarios/)
    assert.match(html, /<b>64<\/b> sub-bots/)
    assert.match(html, /<b>166<\/b> conectados/)
    assert.match(html, /<b>12<\/b> comunidades/)
    assert.match(html, /<b>7<\/b> premium activos/)
    assert.match(html, /<b>3<\/b> premium guardados/)
    // Mantiene el mismo distintivo que el resto (nada de bloques nuevos).
    assert.equal((html.match(/class="stat-badge/g) || []).length, 6)

    // Un servidor sin premium muestra 0, nunca "undefined".
    state.stats = { users: 1, bots: 0, sessionsConnected: 0, communities: 0 }
    renderStatsBadges()
    const vacio = elementos['auth-stats'].innerHTML
    assert.match(vacio, /<b>0<\/b> premium activos/)
    assert.match(vacio, /<b>0<\/b> premium guardados/)
    assert.ok(!vacio.includes('undefined'))
  } finally {
    if (original === undefined) delete globalThis.document
    else globalThis.document = original
    const { state } = await import('../webpanel/public/assets/js/core.js').catch(() => ({ state: null }))
    if (state) state.stats = null
  }
})
