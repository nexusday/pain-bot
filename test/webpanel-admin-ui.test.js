import assert from 'node:assert/strict'
import test from 'node:test'

test('webpanel UI: el principal ve todas las secciones y los demás solo sus permisos', async () => {
  const original = globalThis.document
  globalThis.document = { getElementById: () => null }
  try {
    const { state } = await import('../webpanel/public/assets/js/core.js')
    const { adminTabs, adminSettingsHTML } = await import('../webpanel/public/assets/js/pages-admin.js')
    state.user = { isPrincipal: true, permissions: [] }
    const tabs = adminTabs('settings')
    for (const section of ['overview', 'principal', 'users', 'sessions', 'pairings', 'communities', 'audit', 'roles', 'mail', 'settings']) {
      assert.ok(tabs.includes(`href="#/admin/${section}"`), `falta ${section}`)
    }
    const settings = adminSettingsHTML({ canTurnstile: true, canLimits: true })
    assert.ok(settings.includes('settings-turnstile-form'))
    state.user = { isPrincipal: false, permissions: ['admin.access', 'admin.settings.mail'] }
    const limitedTabs = adminTabs('mail')
    assert.ok(limitedTabs.includes('href="#/admin/mail"'))
    assert.ok(!limitedTabs.includes('href="#/admin/roles"'))
    const limitedSettings = adminSettingsHTML({ canTurnstile: false, canLimits: false })
    assert.ok(!limitedSettings.includes('settings-turnstile-form'))
    assert.match(limitedSettings, /<fieldset[^>]*disabled/)
    state.user = null
  } finally {
    if (original === undefined) delete globalThis.document
    else globalThis.document = original
  }
})
