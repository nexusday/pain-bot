/* Pain Panel — rutas del sub-bot premium (anuncios + personalización) */
import { SIN_RUTA } from './http.js'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { construirPlantillaMenu } from '../menu-categories.js'
import { carpetaSesionValida, normalizarTelefono } from './session-ops.js'
import {
  consumirDesafio,
  estadoDesafio,
  concederPremiumAdmin,
  guardarEdicionesPremium,
  iniciarAnuncio,
  leerAjustesPremium,
  premiumPublico,
  sumarPremium,
  validarEdiciones,
  guardarPluginsComandos,
  fuentePluginComando,
} from './premium.js'

const TAMANOS = {
  small: { ancho: 320, alto: 50 },
  medium: { ancho: 160, alto: 300 },
  native: { ancho: 320, alto: 120 },
  square: { ancho: 300, alto: 250 },
  tall: { ancho: 160, alto: 600 },
  leaderboard: { ancho: 728, alto: 90 },
  wide: { ancho: 468, alto: 60 },
}

function limpiarFuentePluginIA(valor, nombre) {
  let source = String(valor || '').trim().replace(/^```(?:javascript|js)?\s*/i, '').replace(/```$/i, '').trim()
  const bloque = source.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)
  if (bloque) source = bloque[1].trim()
  if (source.length > 20_000 || !/handler\.command\s*=/.test(source) || !/export\s+default/.test(source)) return ''
  if (/(?:node:|require\s*\(|import\s|process\.|child_process|eval\s*\(|new\s+Function|__dirname|__filename|global\.)/i.test(source)) return ''
  return source
}

function escapadoHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Id de contenedor que espera Adsterra: `…/<zona>/invoke.js` → `container-<zona>`.
 * El id sale de la propia URL configurada, sin valores fijos en el código.
 */
function idContenedor(src) {
  try {
    const url = new URL(src)
    const partes = url.pathname.split('/').filter(Boolean)
    let clave = partes[partes.length - 1] || ''
    if (/^invoke\.(js|html?)$/i.test(clave)) clave = partes[partes.length - 2] || ''
    const limpio = clave.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    return limpio ? `container-${limpio}` : ''
  } catch {
    return ''
  }
}

/**
 * HTML del anuncio. Se sirve en su propio iframe para que el script de
 * Adsterra nunca se ejecute en el origen del panel.
 */
function htmlAnuncio({ src, ancho, alto, tipo, contenedor = '', opciones = null }) {
  // El id del contenedor es el que trae el bloque de Adsterra (si venía); si no,
  // se deriva de la URL. Se añade además un `#pain-ad` por si el script inyecta
  // en el div genérico (formato iframe).
  const id = contenedor || idContenedor(src) || 'pain-ad'
  const medidas = opciones && Number(opciones.width) > 0 && Number(opciones.height) > 0
    ? { ancho: Number(opciones.width), alto: Number(opciones.height) }
    : { ancho, alto }
  const altoFijo = `height:${medidas.alto}px;`
  // Recuperar los bloques iframe antiguos que quedaron guardados solo como URL.
  // Native no utiliza atOptions; nunca inferirlo para ese formato.
  const clave = opciones?.key || (tipo !== 'native' ? new URL(src).pathname.match(/\/([a-f0-9]{32})\/invoke\.js$/i)?.[1] : '')
  const configuracion = clave
    ? `<script>var atOptions = ${JSON.stringify({ key: clave, format: opciones?.format || 'iframe', height: medidas.alto, width: medidas.ancho, params: {} })};</script>`
    : ''
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="referrer" content="no-referrer-when-downgrade" />
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
  #contenedor{width:${medidas.ancho}px;${altoFijo}}
  #contenedor iframe{display:block;border:0;}
  .aviso{font:12px system-ui,sans-serif;color:#7c8496;text-align:center;padding:6px;}
</style></head>
<body>
<div id="contenedor"><div id="${escapadoHtml(id)}">
${configuracion}
<script src="${escapadoHtml(src)}" onerror="window.painAdScriptFailed = true"></script>
</div></div>
<script>
(function(){
  var enviado = false;
  function avisar(ok, altoMedido, motivo){
    if (enviado) return;
    enviado = true;
    try { parent.postMessage({ pain: 'ad', ok: !!ok, alto: Math.round(altoMedido || 0), reason: motivo || '' }, '*'); } catch (e) {}
  }
  function medir(){
    var elementos = document.querySelectorAll('#contenedor iframe, #contenedor img');
    return Array.from(elementos).reduce(function(alto, elemento) {
      return Math.max(alto, elemento.getBoundingClientRect().height);
    }, 0);
  }
  function revisar(){
    var alto = medir();
    if (window.painAdScriptFailed) return avisar(false, 0, 'script_error');
    // Ausencia de contenido por sí sola no demuestra bloqueo.
    if (alto > 4) avisar(true, alto);
  }
  // El script del proveedor ya fue incluido en el HTML inicial para que los
  // formatos que usan document.write puedan escribir su iframe correctamente.
  setTimeout(revisar, 100);
  setTimeout(revisar, 2500);
  setTimeout(revisar, 6000);
  window.addEventListener('load', function(){ setTimeout(revisar, 2500); });
})();
</script>
</body></html>`
}

export function crearRutasPremium(ctx) {
  const {
    HttpError, config, json, leerJson, limitar, puede, requerirCsrf, requerirPermiso, requerirUsuario, store, verificarOrigen,
  } = ctx

  async function botDelUsuario(sesion, phone) {
    const limpio = normalizarTelefono(phone) || String(phone || '')
    if (!carpetaSesionValida(limpio)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
    const fila = await store.obtenerBotPorPhone(limpio)
    if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
    const esPropietario = Number(fila.user_id) === Number(sesion.id)
    requerirPermiso(sesion, esPropietario ? 'bots.view' : 'admin.sessions')
    return { phone: limpio, fila, esPropietario }
  }

  return async function rutasPremium({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Estado premium de mis sub-bots ────────────────────────────────────
    if (pathname === '/api/premium' && metodo === 'GET') {
      const sesion = await requerirUsuario(req)
      requerirPermiso(sesion, 'bots.view')
      const ajustes = await leerAjustesPremium(store)
      const filas = await store.listarBotsUsuario(sesion.id)
      const puedeInfinito = puede(sesion, 'admin.users.premium.infinite')
      if (puedeInfinito) {
        for (const fila of filas) concederPremiumAdmin(config.root, fila.phone, { infinito: true })
      }
      const bots = filas.map((fila) => ({
        phone: fila.phone,
        label: fila.label || null,
        ...premiumPublico(config.root, fila.phone, ajustes),
        canGrantInfinite: puedeInfinito,
        canGrantDuration: puede(sesion, 'admin.users.premium.duration'),
      }))
      return json(res, 200, {
        enabled: ajustes.enabled,
        adsAvailable: Boolean(
          ajustes.smartlink || ajustes.banners.small || ajustes.banners.medium || ajustes.banners.native
        ),
        rules: {
          adSeconds: ajustes.adSeconds,
          adMinutes: ajustes.adMinutes,
          maxHours: ajustes.maxHours,
          unlockHours: ajustes.unlockHours,
          cooldownSeconds: ajustes.cooldownSeconds,
        },
        ads: { smartlink: ajustes.smartlink, banners: ajustes.banners },
        // Menú por defecto con {tokens}: es lo que se edita en el panel.
        menuTemplate: construirPlantillaMenu(),
        bots,
      })
    }

    // ── Abrir un anuncio (el contador se mide en el servidor) ─────────────
    if (pathname === '/api/premium/ad/start' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `premium-start:${sesion.id}`, 40, 60 * 60 * 1000)
      const body = await leerJson(req)
      const { phone } = await botDelUsuario(sesion, body.phone)
      requerirPermiso(sesion, 'bots.config')
      const ajustes = await leerAjustesPremium(store)
      const estado = premiumPublico(config.root, phone, ajustes)
      if (estado.locked) {
        throw new HttpError(
          409,
          `Este bot alcanzó el máximo de ${ajustes.maxHours} h de premium. Podrás volver a sumar cuando le queden ${ajustes.unlockHours} h o menos.`,
          'premium_locked'
        )
      }
      const espera = Number(estado.lastClaimAt || 0) + ajustes.cooldownSeconds * 1000
      if (Date.now() < espera) {
        throw new HttpError(
          429,
          `Espera ${Math.ceil((espera - Date.now()) / 1000)} s antes de abrir otro anuncio.`,
          'premium_too_soon'
        )
      }
      let desafio
      try {
        desafio = iniciarAnuncio({ userId: sesion.id, phone, ajustes })
      } catch (error) {
        throw new HttpError(409, error.message, error.code || 'premium_unavailable')
      }
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'premium.ad_start',
        ip,
        meta: { phone, seconds: desafio.seconds },
      })
      return json(res, 200, desafio)
    }

    // ── Reclamar el tiempo del anuncio ────────────────────────────────────
    if (pathname === '/api/premium/ad/claim' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      limitar(req, `premium-claim:${sesion.id}`, 60, 60 * 60 * 1000)
      const body = await leerJson(req)
      const { phone } = await botDelUsuario(sesion, body.phone)
      requerirPermiso(sesion, 'bots.config')
      if (body.blocked === true) {
        throw new HttpError(
          403,
          'Detectamos un bloqueador de anuncios. Desactívalo (o permite este sitio) para ganar horas premium.',
          'premium_adblock'
        )
      }
      const ajustes = await leerAjustesPremium(store)
      // Valida token, dueño y que el tiempo real haya pasado antes de sumar.
      if (!estadoDesafio(body.token, { userId: sesion.id, phone })) {
        throw new HttpError(410, 'El anuncio caducó. Vuelve a abrirlo.', 'premium_ad_expired')
      }
      // Otra pestaña o un cambio de ajustes puede haber llenado el banco
      // mientras este anuncio estaba abierto. No entregar un reclamo extra.
      if (premiumPublico(config.root, phone, ajustes).locked) {
        throw new HttpError(409, 'El banco de premium ya alcanzó el máximo. Espera a que se reabra para sumar más tiempo.', 'premium_locked')
      }
      try {
        consumirDesafio(body.token, { userId: sesion.id, phone })
      } catch (error) {
        throw new HttpError(error.code === 'premium_ad_too_fast' ? 425 : 410, error.message, error.code || 'premium_ad_expired')
      }
      const estado = sumarPremium(config.root, phone, ajustes.adMinutes, ajustes)
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'premium.ad_claim',
        ip,
        meta: { phone, minutes: ajustes.adMinutes, remainingMs: estado.restanteMs },
      })
      return json(res, 200, {
        ok: true,
        grantedMinutes: ajustes.adMinutes,
        ...premiumPublico(config.root, phone, ajustes),
      })
    }

    if (pathname === '/api/premium/infinite' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      requerirPermiso(sesion, 'admin.users.premium.infinite')
      const body = await leerJson(req)
      const { phone } = await botDelUsuario(sesion, body.phone)
      concederPremiumAdmin(config.root, phone, { infinito: true })
      return json(res, 200, { ok: true, premium: premiumPublico(config.root, phone, await leerAjustesPremium(store)) })
    }

    if (pathname === '/api/premium/duration' && metodo === 'POST') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      requerirPermiso(sesion, 'admin.users.premium.duration')
      const body = await leerJson(req)
      const { phone } = await botDelUsuario(sesion, body.phone)
      const dias = Number(body.days)
      if (!Number.isInteger(dias) || dias < 1 || dias > 3650) {
        throw new HttpError(400, 'Indica entre 1 y 3650 días.', 'invalid_premium_days')
      }
      concederPremiumAdmin(config.root, phone, { horas: dias * 24 })
      return json(res, 200, { ok: true, days: dias, premium: premiumPublico(config.root, phone, await leerAjustesPremium(store)) })
    }

    if (seg[0] === 'api' && seg[1] === 'premium' && seg[2] && seg[3] === 'command-generate' && metodo === 'POST') {
      const sesion = await requerirUsuario(req); requerirCsrf(req, sesion); verificarOrigen(req)
      const { phone, esPropietario } = await botDelUsuario(sesion, seg[2]); requerirPermiso(sesion, esPropietario ? 'bots.config' : 'admin.sessions.config')
      const body = await leerJson(req); const name = String(body?.name || '').trim().toLowerCase(); const prompt = String(body?.prompt || '').trim().slice(0, 800)
      if (!/^[a-záéíóúñ][\wáéíóúñ-]{1,30}$/i.test(name) || !prompt) throw new HttpError(400, 'Indica un nombre e instrucción para el plugin.', 'invalid_premium_command')
      try {
        const { generarTextoConProveedores } = await import('../geminiAPI.js')
        const consulta = `Genera el plugin JavaScript real del comando ${name}. Instrucción del usuario: ${prompt}`
        const reglas = `Devuelve SOLO código JavaScript ESM, sin markdown ni explicaciones. Debe contener exactamente un handler async, handler.command = [${JSON.stringify(name)}] y export default handler. Puede usar conn.sendMessage, m.reply, text, args y fetch para consultar datos públicos de Internet. No uses JSON como sustituto del plugin. No uses fs, process, child_process, require, import dinámico, eval, Function, rutas locales, credenciales ni acceso al sistema.`
        let sourceRaw = await generarTextoConProveedores(consulta, reglas)
        let source = limpiarFuentePluginIA(sourceRaw, name)
        // Algunos proveedores devuelven explicación o markdown aunque se les
        // pida código. Se hace una segunda pasada, no se guarda código parcial.
        if (!source) {
          sourceRaw = await generarTextoConProveedores(`${consulta}\nIMPORTANTE: tu respuesta anterior no fue un plugin válido. Devuelve ahora únicamente el archivo .js completo.`, `${reglas}\nLa primera línea debe comenzar con const handler o async function handler.`)
          source = limpiarFuentePluginIA(sourceRaw, name)
        }
        if (!source || /^no wiz data$/i.test(String(sourceRaw || ''))) {
          console.error('[premium-plugin-generate] respuesta no válida:', String(sourceRaw || '').slice(0, 300).replace(/\s+/g, ' '))
          throw new Error('plugin_invalido')
        }
        const command = { name, prompt, response: 'Plugin generado', source }; return json(res, 200, { ok: true, command, source })
      } catch (error) {
        console.error('[premium-plugin-generate]', error?.message || error)
        throw new HttpError(502, error?.message === 'plugin_invalido' ? 'La IA devolvió un plugin incompleto. Inténtalo otra vez.' : 'Los proveedores de IA no devolvieron un plugin utilizable.', 'premium_ai_unavailable')
      }
    }

    if (seg[0] === 'api' && seg[1] === 'premium' && seg[2] && seg[3] === 'commands' && metodo === 'PUT') {
      const sesion = await requerirUsuario(req); requerirCsrf(req, sesion); verificarOrigen(req)
      const { phone, esPropietario } = await botDelUsuario(sesion, seg[2]); requerirPermiso(sesion, esPropietario ? 'bots.config' : 'admin.sessions.config')
      const body = await leerJson(req); if (!Array.isArray(body?.commands)) throw new HttpError(400, 'Lista de plugins inválida.', 'invalid_premium_commands')
      const nombres = body.commands.map((item) => String(item?.name || '').trim().toLowerCase().replace(/[^a-z0-9áéíóúñ_-]/gi, '-').slice(0, 32))
      if (nombres.some((name) => !/^[a-záéíóúñ][\wáéíóúñ-]{1,30}$/i.test(name))) throw new HttpError(400, 'Cada comando necesita un nombre válido.', 'invalid_premium_command_name')
      if (new Set(nombres).size !== nombres.length) throw new HttpError(409, 'No puedes guardar dos plugins con el mismo nombre.', 'premium_command_duplicate')
      const comandos = guardarPluginsComandos(config.root, phone, body.commands); guardarEdicionesPremium(config.root, phone, { comandos })
      try { const { limpiarCachePremium } = await import('../premium.js'); limpiarCachePremium() } catch {}
      return json(res, 200, { ok: true, commands: comandos.map((c) => ({ ...c, source: fuentePluginComando(c) })) })
    }

    if (seg[0] === 'api' && seg[1] === 'premium' && seg[2] && seg[3] === 'command-test' && metodo === 'POST') {
      const sesion = await requerirUsuario(req); requerirCsrf(req, sesion); verificarOrigen(req)
      const { phone, esPropietario } = await botDelUsuario(sesion, seg[2]); requerirPermiso(sesion, esPropietario ? 'bots.config' : 'admin.sessions.config')
      const body = await leerJson(req); const source = String(body?.source || '').slice(0, 20_000); const name = String(body?.name || '').trim().toLowerCase(); const input = String(body?.input || '').trim()
      if (!source || !/handler\.command\s*=/.test(source) || !/export\s+default/.test(source)) throw new HttpError(400, 'Genera primero un plugin válido.', 'invalid_premium_plugin')
      if (!new RegExp(`^[./!#]${name}(?:\\s|$)`, 'i').test(input)) throw new HttpError(400, `Escribe el comando con prefijo: /${name}`, 'premium_command_prefix')
      const temporal = path.join(config.root, String(phone), 'plugins', `.preview-${Date.now()}-${Math.random().toString(36).slice(2)}.js`)
      fs.mkdirSync(path.dirname(temporal), { recursive: true }); fs.writeFileSync(temporal, source, 'utf8')
      let salida = ''
      const mensaje = { chat: 'panel-preview', text: input.replace(/^[./!#]\S*\s*/, '').trim(), sender: 'panel-preview', pushName: 'Vista previa', reply: async (text) => { salida = String(text || '') } }
      const conn = { sendMessage: async (_chat, contenido) => { salida = String(contenido?.text || contenido?.caption || '') } }
      try {
        const modulo = await import(`${pathToFileURL(temporal).href}?preview=${Date.now()}`)
        const handler = modulo.default || modulo
        await handler(mensaje, { conn, text: mensaje.text, args: mensaje.text.split(/\s+/).filter(Boolean), usedPrefix: input[0], command: name })
      } finally { try { fs.unlinkSync(temporal) } catch {} }
      return json(res, 200, { ok: true, input, response: salida || 'El plugin no envió ningún mensaje.' })
    }

    // ── Guardar personalización (se aplica solo con premium activo) ───────
    if (seg[0] === 'api' && seg[1] === 'premium' && seg[2] && seg.length === 3 && metodo === 'PATCH') {
      const sesion = await requerirUsuario(req)
      requerirCsrf(req, sesion)
      verificarOrigen(req)
      const { phone, esPropietario } = await botDelUsuario(sesion, seg[2])
      requerirPermiso(sesion, esPropietario ? 'bots.config' : 'admin.sessions.config')
      const body = await leerJson(req)
      let ediciones
      try {
        ediciones = validarEdiciones(body)
      } catch (error) {
        throw new HttpError(400, error.message, error.code || 'invalid_premium_edit')
      }
      guardarEdicionesPremium(config.root, phone, ediciones)
      const ajustes = await leerAjustesPremium(store)
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'premium.edits',
        ip,
        meta: { phone, campos: Object.keys(ediciones.menu).filter((clave) => ediciones.menu[clave]).length },
      })
      return json(res, 200, { ok: true, ...premiumPublico(config.root, phone, ajustes) })
    }

    // ── Iframe del anuncio (aislado del origen del panel) ─────────────────
    // Es público a propósito: los iframes con `sandbox` no envían la cookie de
    // sesión. No expone datos de nadie, solo el HTML del anuncio configurado.
    if (pathname === '/api/premium/frame' && metodo === 'GET') {
      const tipo = String(url.searchParams.get('b') || 'small').toLowerCase()
      if (!TAMANOS[tipo]) throw new HttpError(400, 'Anuncio desconocido.', 'invalid_ad_slot')
      const ajustes = await leerAjustesPremium(store)
      const src = ajustes.banners[tipo]
      if (!src) throw new HttpError(404, 'Ese anuncio no está configurado.', 'ad_not_configured')
      const { ancho, alto } = TAMANOS[tipo]
      const cuerpo = htmlAnuncio({
        src,
        ancho,
        alto,
        tipo,
        contenedor: ajustes.contenedores?.[tipo] || '',
        opciones: ajustes.opciones?.[tipo] || null,
      })
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(cuerpo),
        // Sin esto el navegador no deja incrustar el anuncio en el panel
        // (las cabeceras globales lo bloquean a propósito).
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline' https: http:; img-src https: http: data:; " +
          "style-src 'unsafe-inline'; frame-src https: http:; connect-src https: http:; frame-ancestors 'self'",
      })
      return res.end(cuerpo)
    }

    return SIN_RUTA
  }
}
