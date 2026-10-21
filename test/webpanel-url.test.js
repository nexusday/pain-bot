import assert from 'node:assert/strict'
import test from 'node:test'
import { panelWebActivo, urlPublicaPanel } from '../lib/webpanel-url.js'

function conEntorno(variables, fn) {
  const anteriores = {}
  for (const [clave, valor] of Object.entries(variables)) {
    anteriores[clave] = process.env[clave]
    if (valor === undefined) delete process.env[clave]
    else process.env[clave] = valor
  }
  const anteriorPanel = global.webPanel
  const anteriorHandle = global.webPanelHandle
  try {
    return fn()
  } finally {
    for (const [clave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[clave]
      else process.env[clave] = valor
    }
    global.webPanel = anteriorPanel
    global.webPanelHandle = anteriorHandle
  }
}

test('webpanel-url: deriva la URL pública del panel', () => {
  conEntorno({
    PAIN_WEB_PUBLIC_URL: undefined,
    PAIN_WEB_SUBDOMAIN: undefined,
    PAIN_WEB_DOMAIN: undefined,
    PAIN_WEB_PORT: undefined,
    PAIN_WEB_INCLUDE_PORT: undefined,
  }, () => {
    global.webPanel = { subdomain: 'pain', domain: 'nexcodea.com', port: 10022, publicUrl: '' }
    global.webPanelHandle = undefined
    assert.equal(urlPublicaPanel(), 'https://pain.nexcodea.com')
  })

  conEntorno({
    PAIN_WEB_PUBLIC_URL: 'https://serbot-pain.nexcodea.com/',
    PAIN_WEB_SUBDOMAIN: undefined,
    PAIN_WEB_DOMAIN: undefined,
  }, () => {
    global.webPanel = { subdomain: 'pain', domain: 'nexcodea.com' }
    global.webPanelHandle = undefined
    assert.equal(urlPublicaPanel(), 'https://serbot-pain.nexcodea.com')
  })

  conEntorno({
    PAIN_WEB_PUBLIC_URL: undefined,
    PAIN_WEB_SUBDOMAIN: 'serbot-pain',
    PAIN_WEB_DOMAIN: 'nexcodea.com',
  }, () => {
    global.webPanel = { subdomain: 'pain', domain: 'otro.com' }
    global.webPanelHandle = undefined
    assert.equal(urlPublicaPanel(), 'https://serbot-pain.nexcodea.com')
  })

  // El handle del panel manda: ya tiene la URL resuelta.
  conEntorno({ PAIN_WEB_PUBLIC_URL: undefined }, () => {
    global.webPanel = { subdomain: 'pain', domain: 'nexcodea.com' }
    global.webPanelHandle = { config: { publicUrl: 'https://del-handle.nexcodea.com' } }
    assert.equal(urlPublicaPanel(), 'https://del-handle.nexcodea.com')
  })
})

test('webpanel-url: el panel se puede apagar por variable', () => {
  conEntorno({ PAIN_WEB_ENABLED: '0' }, () => {
    global.webPanel = { enabled: true }
    assert.equal(panelWebActivo(), false)
  })
  conEntorno({ PAIN_WEB_ENABLED: undefined }, () => {
    global.webPanel = { enabled: true }
    assert.equal(panelWebActivo(), true)
  })
})

test('menú: el encabezado incluye el link global del panel', async () => {
  const { construirEncabezadoMenu } = await import('../lib/menu-categories.js')
  const anteriorHandle = global.webPanelHandle
  const anteriorPublicUrl = process.env.PAIN_WEB_PUBLIC_URL
  try {
    process.env.PAIN_WEB_PUBLIC_URL = 'https://serbot-pain.nexcodea.com'
    global.webPanelHandle = { config: { publicUrl: 'https://serbot-pain.nexcodea.com' } }
    const texto = construirEncabezadoMenu({ sender: '5215551234567@s.whatsapp.net' }, {
      lang: 'es',
      nombreBot: 'Pain Bot',
      tipo: 'privado',
      ping: '10 ms',
      userRole: 'owner',
      botFormatUptime: '1h',
      totalf: '120',
      processRamMB: 80,
      totalRamMB: 512,
      rentalLine: '',
    })
    assert.match(texto, /serbot-pain\.nexcodea\.com/)
    assert.match(texto, /¿Quieres ser subbot de Pain Bot\?/i)
    assert.match(texto, /vincula en/i)
  } finally {
    global.webPanelHandle = anteriorHandle
    if (anteriorPublicUrl === undefined) delete process.env.PAIN_WEB_PUBLIC_URL
    else process.env.PAIN_WEB_PUBLIC_URL = anteriorPublicUrl
  }
})
