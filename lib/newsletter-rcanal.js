/**
 * Utilidades para canales / newsletters de WhatsApp y global.rcanal
 */
import { canalPremiumDeConexion } from './premium.js'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const SUFIJO_NEWSLETTER = '@newsletter'
let ultimoSeguimientoCanal = 0

/** Serializa y espacia las operaciones de canales en el proceso único. */
async function ejecutarSeguimientoCanal(fn) {
  const espera = Math.max(0, ultimoSeguimientoCanal + INTERVALO_SEGUIR_GLOBAL_MS - Date.now())
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera))
  ultimoSeguimientoCanal = Date.now()
  return fn()
}

export function esJidNewsletter(jid) {
  return typeof jid === 'string' && jid.endsWith(SUFIJO_NEWSLETTER)
}

export function normalizarJidNewsletter(id) {
  if (!id) return ''
  const crudo = String(id).trim()
  if (!crudo) return ''
  return crudo.includes('@') ? crudo : `${crudo}${SUFIJO_NEWSLETTER}`
}

export function parsearEntradaCanal(entrada) {
  if (!entrada) return null
  const valor = String(entrada).trim()
  if (!valor) return null

  if (esJidNewsletter(valor)) return { type: 'jid', key: valor }

  const coincidenciaUrl = valor.match(/(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)/i)
  if (coincidenciaUrl) return { type: 'invite', key: coincidenciaUrl[1] }

  if (/^[A-Za-z0-9_-]{10,}$/.test(valor) && !valor.includes('@')) {
    return { type: 'invite', key: valor }
  }

  const digitos = valor.replace(/\D/g, '')
  if (digitos.length >= 12) {
    return { type: 'jid', key: `${digitos}${SUFIJO_NEWSLETTER}` }
  }

  return null
}

function obtenerPayloadMensaje(m) {
  return m?.message || m?.msg || {}
}

function obtenerContextInfoDePayload(payload) {
  if (!payload || typeof payload !== 'object') return null

  for (const clave of Object.keys(payload)) {
    if (clave === 'messageContextInfo' || clave === 'senderKeyDistributionMessage') continue
    const ctx = payload[clave]?.contextInfo
    if (ctx) return ctx
  }

  return payload.messageContextInfo || null
}

export function extraerNewsletterDeMensaje(m) {
  const resultado = { jid: null, name: null, source: null }
  if (!m) return resultado

  const chat = m.chat || m.key?.remoteJid || ''
  if (esJidNewsletter(chat)) {
    resultado.jid = chat
    resultado.source = 'chat'
  }

  const payload = obtenerPayloadMensaje(m)

  const comentario = payload.commentMessage || payload.encCommentMessage
  const jidComentario = comentario?.targetMessageKey?.remoteJid
  if (esJidNewsletter(jidComentario)) {
    resultado.jid = jidComentario
    resultado.source = 'comment'
  }

  const contextInfo = obtenerContextInfoDePayload(payload)
  const reenviado = contextInfo?.forwardedNewsletterMessageInfo
  if (reenviado?.newsletterJid) {
    resultado.jid = reenviado.newsletterJid
    resultado.name = reenviado.newsletterName || resultado.name
    resultado.source = resultado.source || 'forwarded'
  }

  if (contextInfo?.commentParentKey?.remoteJid && esJidNewsletter(contextInfo.commentParentKey.remoteJid)) {
    resultado.jid = contextInfo.commentParentKey.remoteJid
    resultado.source = resultado.source || 'commentParent'
  }

  return resultado
}

export function construirRcanal(jid = '', name = '') {
  return {
    contextInfo: {
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: jid,
        serverMessageId: 100,
        newsletterName: name || 'Canal'
      }
    }
  }
}

export function formatearConfigCanal(jid, name = '') {
  const nombreSeguro = String(name || 'Canal').replace(/'/g, "\\'")
  return `global.canal = {\n  jid: '${jid}',\n  name: '${nombreSeguro}'\n}`
}

export function formatearConfigLogsSubbots(jid, name = 'Logs Sub-Bots') {
  const nombreSeguro = String(name || 'Logs Sub-Bots').replace(/'/g, "\\'")
  return `global.logssubbots = {\n  jid: '${jid}',\n  name: '${nombreSeguro}'\n}`
}

function leerConfigCanalFuente(fuente, nombrePorDefecto = '') {
  let jid = ''
  let name = nombrePorDefecto
  let invite = ''

  if (!fuente) return { jid, name, invite }

  if (typeof fuente === 'string') {
    const parseado = parsearEntradaCanal(fuente)
    if (parseado?.type === 'jid') jid = normalizarJidNewsletter(parseado.key)
    else if (parseado?.type === 'invite') invite = parseado.key
  } else if (typeof fuente === 'object') {
    jid = normalizarJidNewsletter(fuente.jid || fuente.id || '')
    name = fuente.name || name
    invite = fuente.invite || ''
    if (!jid && !invite && fuente.link) {
      const parseado = parsearEntradaCanal(fuente.link)
      if (parseado?.type === 'jid') jid = normalizarJidNewsletter(parseado.key)
      else if (parseado?.type === 'invite') invite = parseado.key
    }
    if (!jid && !invite && fuente.url) {
      const parseado = parsearEntradaCanal(fuente.url)
      if (parseado?.type === 'jid') jid = normalizarJidNewsletter(parseado.key)
      else if (parseado?.type === 'invite') invite = parseado.key
    }
  }

  return { jid, name, invite }
}

function leerConfigCanal() {
  return leerConfigCanalFuente(global.canal, global.canalName || '')
}

function leerConfigLogsSubbots() {
  return leerConfigCanalFuente(global.logssubbots, global.logssubbotsName || 'Logs Sub-Bots')
}

export function obtenerJidLogsSubBots() {
  return global.idlogssubbots || ''
}

export function sincronizarRcanalDesdeConfig() {
  const canal = leerConfigCanal()
  const logs = leerConfigLogsSubbots()

  global.idcanal = canal.jid
  global.namecanal = canal.name
  global.rcanal = construirRcanal(canal.jid, canal.name)
  global._canalInvitePending = canal.invite || ''

  global.idlogssubbots = logs.jid
  global.namelogssubbots = logs.name
  global._logssubbotsInvitePending = logs.invite || ''

  if (canal.jid) {
    console.log(`[canal] rcanal cargado: ${canal.jid}${canal.name ? ` (${canal.name})` : ''}`)
  }
  if (logs.jid) {
    console.log(`[logssubbots] canal cargado: ${logs.jid}${logs.name ? ` (${logs.name})` : ''}`)
  }
}

export async function resolverNewsletter(conn, entrada) {
  const parseado = parsearEntradaCanal(entrada)
  if (!parseado) return null

  if (typeof conn?.newsletterMetadata !== 'function') {
    if (parseado.type === 'jid') {
      return { jid: normalizarJidNewsletter(parseado.key), name: '' }
    }
    return null
  }

  const meta = await conn.newsletterMetadata(parseado.type, parseado.key)
  if (!meta?.id) return null

  const jid = normalizarJidNewsletter(meta.id)
  const name = meta.name || meta.thread_metadata?.name || ''
  return {
    jid,
    name,
    invite: meta.invite || '',
    subscribers: meta.subscribers
  }
}

export async function resolverInvitesCanal(conn) {
  const invitePendiente = global._canalInvitePending
  if (invitePendiente && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resuelto = await resolverNewsletter(conn, invitePendiente)
      if (resuelto?.jid) {
        global.idcanal = resuelto.jid
        global.namecanal = resuelto.name || global.namecanal || 'Canal'
        global.rcanal = construirRcanal(global.idcanal, global.namecanal)
        global._canalInvitePending = ''
        console.log(`[canal] Invite resuelto: ${global.idcanal} (${global.namecanal})`)
      }
    } catch (err) {
      console.error('[canal] No se pudo resolver el invite del config:', err?.message || err)
    }
  }

  if (global.idcanal && !global.namecanal && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resuelto = await resolverNewsletter(conn, global.idcanal)
      if (resuelto?.name) {
        global.namecanal = resuelto.name
        global.rcanal = construirRcanal(global.idcanal, global.namecanal)
      }
    } catch {}
  }

  const inviteLogsPendiente = global._logssubbotsInvitePending
  if (inviteLogsPendiente && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resuelto = await resolverNewsletter(conn, inviteLogsPendiente)
      if (resuelto?.jid) {
        global.idlogssubbots = resuelto.jid
        global.namelogssubbots = resuelto.name || global.namelogssubbots || 'Logs Sub-Bots'
        global._logssubbotsInvitePending = ''
        console.log(`[logssubbots] Invite resuelto: ${global.idlogssubbots} (${global.namelogssubbots})`)
      }
    } catch (err) {
      console.error('[logssubbots] No se pudo resolver el invite del config:', err?.message || err)
    }
  }

  if (global.idlogssubbots && !global.namelogssubbots && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resuelto = await resolverNewsletter(conn, global.idlogssubbots)
      if (resuelto?.name) global.namelogssubbots = resuelto.name
    } catch {}
  }
}

export async function resolverConfigCanal(conn) {
  await resolverInvitesCanal(conn)
  // Con cientos de subbots, seguir 2 canales por sesión son cientos de
  // consultas a WhatsApp que compiten con los handshakes y los mensajes.
  // El canal se sigue solo en el principal; un subbot puede usar el contexto
  // de canal sin unirse. PAIN_SUBBOT_FOLLOW_CHANNELS=1 lo vuelve a activar.
  if (conn?.pathAYBot && process.env.PAIN_SUBBOT_FOLLOW_CHANNELS !== '1') {
    return true
  }
  const seguido = await seguirCanalesConfigurados(conn, { resolver: false })
  // Si un invite no pudo resolverse todavía, no fijamos la firma en el
  // sub-bot: la siguiente conexión debe volver a intentarlo.
  const invitePendiente = Boolean(
    global._canalInvitePending || global._logssubbotsInvitePending
  )
  return seguido !== false && !invitePendiente
}

const _jidsCanalResueltos = new Map()
const VERSION_MARCA_SEGUIMIENTO = 1
const ARCHIVO_MARCA_SEGUIMIENTO = '.newsletter-follow-state.json'
const INTERVALO_SEGUIR_GLOBAL_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_NEWSLETTER_RATE_MS, 10) || 900, 250),
  30_000
)
const ASENTAMIENTO_CONEXION_MS = 2500

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function prepararAccesoNewsletter(conn, jid) {
  if (!jid || typeof conn?.newsletterMetadata !== 'function') return
  try {
    await conn.newsletterMetadata('jid', jid)
  } catch {}
}

async function suscribirNewsletterSiPuede(conn, jid) {
  if (!jid || typeof conn?.subscribeNewsletterUpdates !== 'function') return
  try {
    await conn.subscribeNewsletterUpdates(jid)
  } catch {}
}

const ID_CONSULTA_UNIRSE_NEWSLETTER = '24404358912487870'
const RUTA_UNIRSE_NEWSLETTER = 'xwa2_newsletter_join_v2'

export async function obtenerObjetivosSeguirCanal(conn, { resolver = true } = {}) {
  if (resolver) await resolverInvitesCanal(conn)

  const objetivos = new Map()

  const agregarJid = (jid, etiqueta) => {
    const normalizado = normalizarJidNewsletter(jid)
    if (normalizado) objetivos.set(normalizado, etiqueta)
  }

  const agregarCrudo = async (crudo, etiqueta) => {
    const valor = String(crudo || '').trim()
    if (!valor) return
    const jid = await resolverJidCanal(conn, valor)
    if (jid) objetivos.set(jid, etiqueta)
  }

  if (global.ch && typeof global.ch === 'object') {
    for (const [clave, valor] of Object.entries(global.ch)) {
      await agregarCrudo(valor, clave)
    }
  }

  // Cada sub-bot premium sigue además su propio canal, sin tocar los canales
  // globales que comparten el resto de bots del proceso.
  const premiumCanal = canalPremiumDeConexion(conn)
  if (premiumCanal?.jid) agregarJid(premiumCanal.jid, 'premium')

  const logsDesdeConfig = leerConfigLogsSubbots()
  if (global.idlogssubbots) {
    agregarJid(global.idlogssubbots, 'logssubbots')
  } else if (logsDesdeConfig.jid) {
    agregarJid(logsDesdeConfig.jid, 'logssubbots')
  } else if (logsDesdeConfig.invite) {
    await agregarCrudo(logsDesdeConfig.invite, 'logssubbots')
  } else if (global.logssubbots) {
    await agregarCrudo(global.logssubbots, 'logssubbots')
  }

  return [...objetivos.entries()].map(([jid, label]) => ({ jid, label }))
}

async function unirseCanalNewsletter(conn, jid) {
  if (!jid || !conn) return null

  if (typeof conn.query === 'function' && typeof conn.generateMessageTag === 'function') {
    const { S_WHATSAPP_NET, getBinaryNodeChild } = await import('@whiskeysockets/baileys/lib/WABinary/index.js')

    const resultado = await conn.query({
      tag: 'iq',
      attrs: {
        id: conn.generateMessageTag(),
        type: 'get',
        to: S_WHATSAPP_NET,
        xmlns: 'w:mex'
      },
      content: [
        {
          tag: 'query',
          attrs: { query_id: ID_CONSULTA_UNIRSE_NEWSLETTER },
          content: Buffer.from(
            JSON.stringify({ variables: { newsletter_id: jid } }),
            'utf-8'
          )
        }
      ]
    })

    const hijo = getBinaryNodeChild(resultado, 'result')
    if (hijo?.content) {
      const datos = JSON.parse(hijo.content.toString())
      if (datos.errors?.length) {
        const mensaje = datos.errors.map((err) => err.message || 'Unknown error').join(', ')
        throw new Error(mensaje)
      }
      const respuesta = datos?.data?.[RUTA_UNIRSE_NEWSLETTER]
      if (typeof respuesta !== 'undefined') return respuesta
      if (datos?.data) return datos.data
    }
  }

  if (typeof conn.newsletterFollow === 'function') {
    return conn.newsletterFollow(jid)
  }

  return null
}

function esErrorYaSiguiendo(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return msg.includes('unexpected response structure')
    || msg.includes('already')
    || msg.includes('ya sigues')
}

function raizCanalesCompartida(conn) {
  if (conn?.pathAYBot) {
    return path.resolve(path.dirname(String(conn.pathAYBot)))
  }
  return path.resolve(String(global.bot || 'Serbot'))
}

function rutaMarcaSeguimiento(conn) {
  const raiz = raizCanalesCompartida(conn)
  if (conn?.pathAYBot) {
    return path.join(path.resolve(String(conn.pathAYBot)), ARCHIVO_MARCA_SEGUIMIENTO)
  }
  // El principal no tiene pathAYBot; conserva su marca separada de las
  // sesiones para no mezclar identidades.
  return path.join(raiz, '.primary-newsletter-follow-state.json')
}

function identidadCuenta(conn) {
  return [
    conn?.user?.jid,
    conn?.user?.id,
    conn?.authState?.creds?.me?.id
  ].filter(Boolean).map(String).join('|')
}

function leerMarcaSeguimiento(conn) {
  const vacia = { version: VERSION_MARCA_SEGUIMIENTO, targets: {} }
  try {
    const datos = JSON.parse(fs.readFileSync(rutaMarcaSeguimiento(conn), 'utf8'))
    if (datos?.version !== VERSION_MARCA_SEGUIMIENTO) return vacia
    if (!datos.targets || typeof datos.targets !== 'object') return vacia
    return { version: datos.version, targets: datos.targets }
  } catch {
    return vacia
  }
}

function guardarMarcaSeguimiento(conn, marca) {
  const ruta = rutaMarcaSeguimiento(conn)
  const temporal = `${ruta}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    fs.writeFileSync(temporal, JSON.stringify(marca, null, 2), { mode: 0o600 })
    try {
      fs.renameSync(temporal, ruta)
    } catch {
      // Windows no permite reemplazar un archivo existente con renameSync.
      try { fs.unlinkSync(ruta) } catch {}
      fs.renameSync(temporal, ruta)
    }
    return true
  } catch (error) {
    try { fs.unlinkSync(temporal) } catch {}
    console.error('[canal] No se pudo guardar la marca de seguimiento:', error?.message || error)
    return false
  }
}

function claveObjetivoSeguimiento(jid, label) {
  return `${VERSION_MARCA_SEGUIMIENTO}|${jid}|${label || ''}`
}

function yaMarcadoSeguimiento(marca, jid, label, cuenta) {
  const entrada = marca.targets?.[jid]
  return Boolean(
    entrada &&
    entrada.configKey === claveObjetivoSeguimiento(jid, label) &&
    entrada.account === cuenta
  )
}

function socketNoDebeSeguir(conn) {
  const estado = conn?.ws?.socket?.readyState ?? conn?.ws?.readyState
  const cerrado = Boolean(
    conn?.ws &&
    (conn.ws.isOpen === false || estado === 2 || estado === 3)
  )
  return Boolean(
    conn?._ignorarCierre ||
    conn?._painSupervisorHandoff ||
    conn?._painLeaseHandoff ||
    cerrado
  )
}

export async function resolverJidCanal(conn, entrada) {
  if (!entrada) return null
  const crudo = String(entrada).trim()
  if (esJidNewsletter(crudo)) return crudo

  if (_jidsCanalResueltos.has(crudo)) return _jidsCanalResueltos.get(crudo)

  let jid = null
  try {
    const resuelto = await resolverNewsletter(conn, crudo)
    jid = resuelto?.jid || null
  } catch {}

  if (!jid && global.idlogssubbots && parsearEntradaCanal(crudo)?.type === 'invite') {
    jid = global.idlogssubbots
  }

  if (!jid && global.idcanal && parsearEntradaCanal(crudo)?.type === 'invite') {
    jid = global.idcanal
  }

  if (jid) _jidsCanalResueltos.set(crudo, jid)
  return jid
}

export async function seguirCanalesConfigurados(conn, { resolver = true } = {}) {
  if (!conn?.user) return false

  const objetivos = await obtenerObjetivosSeguirCanal(conn, { resolver })
  if (!objetivos.length) return true

  const etiquetaBot = conn.user?.id?.split('@')[0] || conn.user?.jid?.split('@')[0] || 'bot'
  const marca = leerMarcaSeguimiento(conn)
  const cuenta = identidadCuenta(conn)
  const pendientes = objetivos.filter(({ jid, label }) =>
    !yaMarcadoSeguimiento(marca, jid, label, cuenta)
  )
  if (!pendientes.length) return true

  // Solo las sesiones que todavía tienen un objetivo pendiente esperan al
  // asentamiento. Las reconexiones normales ya marcadas no crean timers ni
  // consultas de newsletter.
  if (ASENTAMIENTO_CONEXION_MS > 0) await dormir(ASENTAMIENTO_CONEXION_MS)

  let todoCompletado = true
  for (const { jid, label } of pendientes) {
    if (socketNoDebeSeguir(conn)) return false

    const resultado = await ejecutarSeguimientoCanal(async () => {
        await prepararAccesoNewsletter(conn, jid)

        let unido = false
        for (let intento = 1; intento <= 2 && !unido; intento++) {
          try {
            await unirseCanalNewsletter(conn, jid)
            console.log(`[canal] +${etiquetaBot} siguiendo (${label}): ${jid}`)
            unido = true
          } catch (err) {
            if (esErrorYaSiguiendo(err)) {
              console.log(`[canal] +${etiquetaBot} ya sigue (${label}): ${jid}`)
              unido = true
              break
            }
            if (intento < 2) {
              await dormir(2000)
              continue
            }
            console.error(`[canal] Error al seguir (${label}) ${jid}:`, err?.message || err)
          }
        }

        if (!unido) return false

        // La consulta de seguimiento y la suscripción a actualizaciones son
        // una sola operación lógica. Aunque WhatsApp responda "already", se
        // marca como completada para no repetirla en cada reconexión.
        await suscribirNewsletterSiPuede(conn, jid)
        marca.targets[jid] = {
          configKey: claveObjetivoSeguimiento(jid, label),
          account: cuenta,
          followedAt: new Date().toISOString()
        }
        return guardarMarcaSeguimiento(conn, marca)
    })

    if (resultado !== true) todoCompletado = false
    if (resultado === null && socketNoDebeSeguir(conn)) return false
  }
  return todoCompletado
}

export {
  esJidNewsletter as isNewsletterJid,
  normalizarJidNewsletter as normalizeNewsletterJid,
  parsearEntradaCanal as parseChannelInput,
  extraerNewsletterDeMensaje as extractNewsletterFromMessage,
  construirRcanal as buildRcanal,
  formatearConfigCanal as formatCanalConfig,
  formatearConfigLogsSubbots as formatLogsSubbotsConfig,
  obtenerJidLogsSubBots as getSubBotsLogsJid,
  sincronizarRcanalDesdeConfig as syncRcanalFromConfig,
  resolverNewsletter as resolveNewsletter,
  resolverInvitesCanal as resolveChannelInvites,
  resolverConfigCanal as resolveCanalConfig,
  obtenerObjetivosSeguirCanal as getChannelFollowTargets,
  resolverJidCanal as resolveChannelJid,
  seguirCanalesConfigurados as followConfiguredChannels
}
