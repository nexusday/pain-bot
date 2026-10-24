/* Pain Panel — rutas del sub-bot premium (anuncios + personalización) */
import { SIN_RUTA } from './http.js'
import { construirPlantillaMenu } from '../menu-categories.js'
import { carpetaSesionValida, normalizarTelefono } from './session-ops.js'
import {
  consumirDesafio,
  estadoDesafio,
  guardarEdicionesPremium,
  iniciarAnuncio,
  leerAjustesPremium,
  premiumPublico,
  sumarPremium,
  validarEdiciones,
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
    HttpError, config, json, leerJson, limitar, requerirCsrf, requerirPermiso, requerirUsuario, store, verificarOrigen,
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
      const bots = filas.map((fila) => ({
        phone: fila.phone,
        label: fila.label || null,
        ...premiumPublico(config.root, fila.phone, ajustes),
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
          `Este bot ya tiene el máximo de ${ajustes.maxHours} h de premium. El botón se desbloquea al bajar de ${ajustes.unlockHours} h.`,
          'premium_locked'
        )
      }
      if (estado.remainingMs > ajustes.unlockHours * 60 * 60 * 1000) {
        throw new HttpError(
          409,
          `Todavía le quedan más de ${ajustes.unlockHours} h de premium. Podrás sumar más tiempo cuando baje de ese límite.`,
          'premium_cooldown_hours'
        )
      }
      const espera = Number(estado.ultimoAnuncio || 0) + ajustes.cooldownSeconds * 1000
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
