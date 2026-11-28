import assert from 'node:assert/strict'
import test from 'node:test'

test('webpanel UI: el principal ve todas las secciones y los demás solo sus permisos', async () => {
  const original = globalThis.document
  globalThis.document = { getElementById: () => null }
  try {
    const { state } = await import('../webpanel/public/assets/js/core.js')
    const { adminTabs, adminSettingsHTML } = await import('../webpanel/public/assets/js/pages-admin.js')
    state.user = { id: 1, isPrincipal: true, permissions: [] }
    const tabs = adminTabs('settings')
    for (const section of ['overview', 'principal', 'users', 'sessions', 'pairings', 'communities', 'audit', 'roles', 'mail', 'settings','notifications','backups']) {
      assert.ok(tabs.includes(`href="#/admin/${section}"`), `falta ${section}`)
    }
    const settings = adminSettingsHTML({ canTurnstile: true, canLimits: true }, 'security')
    assert.ok(settings.includes('settings-turnstile-form'))
    assert.ok(settings.includes('data-tab="limits"'))
    assert.ok(adminSettingsHTML({ canTurnstile: true, canLimits: true }, 'maintenance').includes('admin-update'))
    const {backupsHTML,notificationsHTML}=await import('../webpanel/public/assets/js/admin-tools.js')
    assert.equal((backupsHTML().match(/name="currentPassword"/g)||[]).length,2)
    const notices=notificationsHTML({users:[{id:2,username:'<script>test</script>',activeDevices:0,pushStatus:'inactive'}],settings:{enabled:true,promptMinutes:60},history:[],canSettings:true})
    assert.ok(!notices.includes('<script>test</script>'))
    assert.ok(notices.includes('&lt;script&gt;'))
    state.user = { isPrincipal: false, permissions: ['admin.access', 'admin.settings.mail'] }
    const limitedTabs = adminTabs('mail')
    assert.ok(limitedTabs.includes('href="#/admin/mail"'))
    assert.ok(!limitedTabs.includes('href="#/admin/roles"'))
    assert.ok(!limitedTabs.includes('href="#/admin/backups"'))
    const limitedSettings = adminSettingsHTML({ canTurnstile: false, canLimits: false })
    assert.ok(!limitedSettings.includes('settings-turnstile-form'))
    assert.match(limitedSettings, /<fieldset[^>]*disabled/)
    state.user = null
  } finally {
    if (original === undefined) delete globalThis.document
    else globalThis.document = original
  }
})
