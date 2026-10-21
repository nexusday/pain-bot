/**
 * URL pública del panel web. La usan el menú del bot, el comando /code y los
 * mensajes de bienvenida, así que se puede leer desde cualquier proceso
 * (principal o workers) sin depender de que el panel esté levantado.
 */

function desdeConfig() {
  const base = (global.webPanel && typeof global.webPanel === 'object') ? global.webPanel : {}
  const port = Number.parseInt(process.env.PAIN_WEB_PORT ?? base.port, 10) || 10022
  const subdomain = String(process.env.PAIN_WEB_SUBDOMAIN ?? base.subdomain ?? '')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  const domain = String(process.env.PAIN_WEB_DOMAIN ?? base.domain ?? '')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  const explicita = String(process.env.PAIN_WEB_PUBLIC_URL || base.publicUrl || '')
    .trim()
    .replace(/\/+$/, '')

  if (explicita) return explicita

  if (domain) {
    const host = subdomain ? `${subdomain}.${domain}` : domain
    const incluirPuerto = base.includePort === true || process.env.PAIN_WEB_INCLUDE_PORT === '1'
    const puerto = incluirPuerto && port !== 80 && port !== 443 ? `:${port}` : ''
    return `https://${host}${puerto}`
  }

  return `http://localhost:${port}`
}

/** URL pública del panel (sin barra final). */
export function urlPublicaPanel() {
  const handle = global.webPanelHandle
  if (handle?.config?.publicUrl) return String(handle.config.publicUrl).replace(/\/+$/, '')
  return desdeConfig()
}

/** ¿Está el panel web disponible? */
export function panelWebActivo() {
  if (process.env.PAIN_WEB_ENABLED === '0') return false
  if (global.webPanel?.enabled === false) return false
  return true
}
