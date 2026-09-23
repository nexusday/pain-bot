import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { extraerNewsletterDeMensaje } from '../newsletter-rcanal.js'
import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  candidatosJidRemitente,
  recolectarConexionesBot
} from '../group-participant.js'
import { isOwnerJid } from '../resolve-group-target.js'

const UMBRAL_KICK = 8
const VENTANA_JOIN_MS = 120_000
const VENTANA_PROBE_MS = 18_000
const INVIS = '\u200E'

const joinsRecientes = new Map()
const probesActivos = new Map()
const probesEnCurso = new Set()
const msgsRecientesBot = new Map()
const MAX_MSGS_TRACK = 20
const VENTANA_MSGS_MS = 180_000

function registrarMsgReciente(chatId, userJid, key) {
  if (!chatId || !userJid || !key) return
  const clave = claveUsuario(chatId, userJid)
  const lista = msgsRecientesBot.get(clave) || []
  const ahora = Date.now()
  lista.push({ key, at: ahora })
  const filtrada = lista
    .filter(x => ahora - x.at <= VENTANA_MSGS_MS)
    .slice(-MAX_MSGS_TRACK)
  msgsRecientesBot.set(clave, filtrada)
}

function keysMsgsRecientes(chatId, userJid) {
  const clave = claveUsuario(chatId, userJid)
  const lista = msgsRecientesBot.get(clave) || []
  const ahora = Date.now()
  return lista.filter(x => ahora - x.at <= VENTANA_MSGS_MS).map(x => x.key)
}

function keysDesdeStore(conn, chatId, userJid) {
  const keys = []
  try {
    const store = conn.chats?.[chatId]?.messages
    if (!store) return keys
    const entries = store instanceof Map ? [...store.values()] : Object.values(store)
    const dig = digitos(userJid)
    const idsOk = new Set([userJid, dig, `${dig}@s.whatsapp.net`, `${dig}@lid`].filter(Boolean))

    for (const entry of entries) {
      const msg = entry?.message ? entry : entry
      const key = msg?.key
      if (!key?.id) continue
      const part = conn.decodeJid?.(key.participant || key.remoteJid) || key.participant || ''
      const d = digitos(part)
      if (idsOk.has(part) || (d && idsOk.has(d))) {
        keys.push(key)
      }
    }
  } catch {}
  return keys.slice(-MAX_MSGS_TRACK)
}

async function borrarMsgsDelUsuario(conn, chatId, userJid, keyExtra = null) {
  const vistos = new Set()
  const cola = []

  const push = (key) => {
    if (!key?.id) return
    const id = String(key.id)
    if (vistos.has(id)) return
    vistos.add(id)
    cola.push(key)
  }

  if (keyExtra) push(keyExtra)
  for (const k of keysMsgsRecientes(chatId, userJid)) push(k)
  for (const k of keysDesdeStore(conn, chatId, userJid)) push(k)

  for (const key of cola) {
    await conn.sendMessage(chatId, { delete: key }).catch(() => {})
  }

  msgsRecientesBot.delete(claveUsuario(chatId, userJid))
  return cola.length
}

const MARCAS_PAIN = [
  /pain[\s_-]?bot/i,
  /𝙥𝙖𝙞𝙣/i,
  /nexo community/i
]

function digitos(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function claveUsuario(chatId, userJid) {
  return `${chatId}::${digitos(userJid) || userJid}`
}

function agregarId(set, valor) {
  if (!valor) return
  const s = String(valor)
  set.add(s)
  const d = digitos(s)
  if (d.length >= 8) {
    set.add(d)
    set.add(`${d}@s.whatsapp.net`)
    set.add(`${d}@lid`)
  }
}

function newslettersPain() {
  const set = new Set()
  const fuentes = [global.canal, global.logssubbots, global.rcanal]
  for (const f of fuentes) {
    if (!f) continue
    if (typeof f === 'string') {
      const m = f.match(/(\d{10,}@newsletter)/) || f.match(/(\d{15,})/)
      if (m) set.add(m[1].includes('@') ? m[1] : `${m[1]}@newsletter`)
      continue
    }
    if (f.jid) set.add(String(f.jid))
    const nj = f.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid
    if (nj) set.add(String(nj))
  }
  return set
}

function numerosSerbotEnDisco() {
  const nums = new Set()
  try {
    const dir = join(process.cwd(), global.bot || 'Serbot')
    if (!existsSync(dir)) return nums
    for (const nombre of readdirSync(dir, { withFileTypes: true })) {
      if (!nombre.isDirectory()) continue
      const d = digitos(nombre.name)
      if (d.length >= 8) nums.add(d)
    }
  } catch {}
  return nums
}

export function recolectarIdsPainBot(conn) {
  const set = new Set()
  for (const c of recolectarConexionesBot(conn)) {
    agregarId(set, c.user?.id)
    agregarId(set, c.user?.jid)
    agregarId(set, c.user?.lid)
    agregarId(set, c.authState?.creds?.me?.id)
    agregarId(set, c.authState?.creds?.me?.jid)
    agregarId(set, c.authState?.creds?.me?.lid)
  }
  if (global.mainBotJid) agregarId(set, global.mainBotJid)
  for (const d of numerosSerbotEnDisco()) agregarId(set, d)
  for (const [n] of global.owner || []) agregarId(set, n)
  for (const [n] of global.ownerLid || []) agregarId(set, n)
  return set
}

export function esRemitentePainBot(m, conn, participants = []) {
  const idsPain = recolectarIdsPainBot(conn)
  const candidatos = candidatosJidRemitente(m, conn)
  for (const j of candidatos) {
    if (idsPain.has(j) || idsPain.has(digitos(j))) return true
  }

  const part = findGroupParticipant(participants, m, conn)
  if (part) {
    for (const j of jidsParticipante(part, conn)) {
      if (idsPain.has(j) || idsPain.has(digitos(j))) return true
    }
  }

  if (m.fromMe) return true
  return false
}

export function registrarJoinAntiBot(chatId, userJid) {
  if (!chatId || !userJid) return
  joinsRecientes.set(claveUsuario(chatId, userJid), Date.now())
}

function joinReciente(chatId, userJid) {
  const clave = claveUsuario(chatId, userJid)
  const at = joinsRecientes.get(clave)
  if (!at) return false
  if (Date.now() - at > VENTANA_JOIN_MS) {
    joinsRecientes.delete(clave)
    return false
  }
  return true
}

function probePendiente(chatId, userJid) {
  const clave = claveUsuario(chatId, userJid)
  const p = probesActivos.get(clave)
  if (!p) return null
  if (Date.now() > p.until) {
    probesActivos.delete(clave)
    return null
  }
  return p
}

function textoMensaje(m) {
  return String(m?.text || m?.msg?.text || m?.msg?.caption || m?.caption || '').trim()
}

function densidadComandos(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lineas.length < 3) return 0
  let cmds = 0
  for (const l of lineas) {
    if (/^[>✦❖▣・﹒•\*◦▪▫◆◇★☆➤➜➤\-+–—]\s*[.#/!¡$]\S{1,}/i.test(l)) cmds++
    else if (/^[.#/!¡$][\w.]{2,}/i.test(l)) cmds++
    else if (/\b(menu|comandos?|commands?|ayuda|help|owner|jadibot|serbot|subbot|play|sticker)\b/i.test(l) && /[.#/!]/.test(l)) cmds++
  }
  return cmds
}

function tieneCajaDecorativa(texto) {
  return /[╔╗╚╝╠╣║═┏┓┗┛┃━╭╮╰╯│─『』「」【】〖〗◈❖✦✧✪⭐]/u.test(texto || '')
}

function pareceMenuEstructural(texto) {
  if (!texto || texto.length < 35) return false
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const cmds = densidadComandos(texto)
  const ratio = lineas.length ? cmds / lineas.length : 0

  if (cmds >= 5) return true
  if (cmds >= 3 && ratio >= 0.35) return true
  if (cmds >= 3 && tieneCajaDecorativa(texto)) return true
  if (
    cmds >= 2 &&
    /(lista de comandos|comandos disponibles|menu (principal|completo)|categor[ií]as|información del bot|info del bot|\bowner\b|\bcreador\b|\bjadibot\b|\bserbot\b|\bsubbots?\b)/i.test(texto)
  ) {
    return true
  }
  if (
    tieneCajaDecorativa(texto) &&
    lineas.length >= 6 &&
    cmds >= 2 &&
    /(menu|comandos?|owner|creador|ayuda|help)/i.test(texto)
  ) {
    return true
  }
  return false
}

function pareceErrorComandoBot(texto) {
  if (!texto || texto.length < 8) return false
  return (
    /comando\s+(no\s+encontrado|inexistente|inv[aá]lido|incorrecto|desconocido)/i.test(texto) ||
    /command\s+not\s+found/i.test(texto) ||
    /(usa|escribe|prueba|ejemplo).{0,12}[.#/!]?(menu|help|ayuda)/i.test(texto) ||
    /no\s+existe\s+ese\s+comando/i.test(texto) ||
    /opci[oó]n\s+no\s+v[aá]lida/i.test(texto)
  )
}

function pareceSaludoBotAuto(texto) {
  if (!texto || texto.length < 20) return false
  if (pareceMenuEstructural(texto)) return true
  return (
    /(hola|hey|buenas).{0,40}(soy|me llamo).{0,40}(bot|md|assistant)/i.test(texto) ||
    /(presiona|elige|selecciona).{0,30}(opci[oó]n|bot[oó]n|categor)/i.test(texto) ||
    /(para\s+ver\s+el\s+men[uú]|escribe\s+[.#/!]menu)/i.test(texto)
  )
}

function tieneMarcaPain(texto) {
  return MARCAS_PAIN.some(r => r.test(texto || ''))
}

function esNewsletterAjeno(m) {
  const info = extraerNewsletterDeMensaje(m)
  if (!info?.jid) return false
  const pain = newslettersPain()
  if (pain.has(info.jid)) return false
  const nombre = String(info.name || '')
  if (/pain|nexo community/i.test(nombre)) return false
  return true
}

function esMensajeInteractivoBot(m) {
  const msg = m?.message || {}
  if (msg.listMessage || msg.buttonsMessage || msg.templateMessage) return true
  if (msg.interactiveMessage || msg.viewOnceMessageV2?.message?.interactiveMessage) return true
  const keys = Object.keys(msg)
  if (keys.some(k => /interactive|buttons|nativeFlow|listMessage/i.test(k))) return true
  return false
}

function idPareceClienteBot(m) {
  const id = String(m?.key?.id || m?.id || '')
  if (!id || m?.fromMe) return false
  if (/^3EB0/i.test(id) && id.length >= 18 && id.length <= 24) return true
  if (/^[A-F0-9]{18,22}$/i.test(id) && !/^[0-9]+$/.test(id)) return false
  return false
}

export function puntuarSospechaBot(m) {
  const texto = textoMensaje(m)
  let score = 0
  const razones = []

  if (tieneMarcaPain(texto)) {
    return { score: 0, razones: ['marca_pain'], texto }
  }

  const newsletterAjeno = esNewsletterAjeno(m)
  const menu = pareceMenuEstructural(texto)
  const interactivo = esMensajeInteractivoBot(m)
  const cmds = densidadComandos(texto)
  const errorCmd = pareceErrorComandoBot(texto)
  const saludoAuto = pareceSaludoBotAuto(texto)
  const probe = probePendiente(m.chat, m.sender)
  const postJoin = joinReciente(m.chat, m.sender)
  const idBotish = idPareceClienteBot(m)

  if (probe) {
    if (menu || errorCmd || saludoAuto || interactivo || newsletterAjeno) {
      score += 12
      razones.push('respuesta_probe')
    } else if (texto.length > 60 && cmds >= 1) {
      score += 8
      razones.push('respuesta_probe_larga')
    }
  }

  if (newsletterAjeno && (menu || interactivo || cmds >= 3 || errorCmd)) {
    score += 10
    razones.push('rcanal+firma')
  } else if (newsletterAjeno && postJoin) {
    score += 6
    razones.push('rcanal_post_join')
  } else if (newsletterAjeno) {
    score += 3
    razones.push('rcanal_ajeno')
  }

  if (menu) {
    score += 8
    razones.push('menu_estructural')
  }

  if (errorCmd) {
    score += 9
    razones.push('error_comando')
  }

  if (interactivo && (menu || cmds >= 2 || saludoAuto || postJoin)) {
    score += 6
    razones.push('ui_menu')
  } else if (interactivo && newsletterAjeno) {
    score += 5
    razones.push('ui_rcanal')
  }

  if (saludoAuto && (postJoin || probe || interactivo)) {
    score += 5
    razones.push('saludo_auto')
  }

  if (postJoin && (menu || errorCmd || (interactivo && cmds >= 1))) {
    score += 4
    razones.push('firma_post_join')
  }

  if (idBotish && (menu || newsletterAjeno || errorCmd || interactivo)) {
    score += 2
    razones.push('id_cliente_bot')
  }

  return { score, razones, texto }
}

async function expulsarBot(m, conn, rcanal, score, razones) {
  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(() => null)) ||
    {}
  const partes = metadatos.participants || []
  const botPart = findBotParticipant(partes, conn)
  const soyAdmin =
    botPart?.admin === 'admin' || botPart?.admin === 'superadmin'
  if (!soyAdmin) return false

  await borrarMsgsDelUsuario(conn, m.chat, m.sender, m.key)

  await conn.sendMessage(
    m.chat,
    {
      text:
        `*Anti-Bot*\n\n` +
        `> @${String(m.sender).split('@')[0]} detectado como bot ajeno.\n` +
        `> Será eliminado del grupo.`,
      contextInfo: {
        ...(rcanal?.contextInfo || {}),
        mentionedJid: [m.sender]
      }
    }
  ).catch(() => {})

  await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
  probesActivos.delete(claveUsuario(m.chat, m.sender))
  console.log(`[antibot] kick ${m.sender} score=${score} razones=${razones.join(',')}`)
  return true
}

/**
 * Probe silencioso: mención + prefijo invisible.
 * Muchos bots contestan solos (menú / "comando no encontrado").
 * El mensaje se borra al momento para casi no verse.
 */
export async function lanzarProbeSilencioso(conn, chatId, userJid) {
  const clave = claveUsuario(chatId, userJid)
  if (probesEnCurso.has(clave) || probePendiente(chatId, userJid)) return false
  if (esRemitentePainBot({ sender: userJid, key: { participant: userJid } }, conn, [])) {
    return false
  }

  probesEnCurso.add(clave)
  try {
    await new Promise(r => setTimeout(r, 1800 + Math.floor(Math.random() * 1200)))

    if (!global.db?.data?.antiBot?.[chatId]) return false

    const enviado = await conn.sendMessage(chatId, {
      text: `.${INVIS}`,
      mentions: [userJid]
    })

    probesActivos.set(clave, {
      until: Date.now() + VENTANA_PROBE_MS,
      key: enviado?.key || null
    })

    setTimeout(() => {
      if (enviado?.key) {
        conn.sendMessage(chatId, { delete: enviado.key }).catch(() => {})
      }
    }, 1200)

    setTimeout(() => {
      const p = probesActivos.get(clave)
      if (p && Date.now() > p.until - 1000) probesActivos.delete(clave)
    }, VENTANA_PROBE_MS + 500)

    return true
  } catch (e) {
    console.error('[antibot] probe:', e?.message || e)
    return false
  } finally {
    probesEnCurso.delete(clave)
  }
}

export async function manejarAntiBot(m, conn, esAdmin, rcanal) {
  if (!m?.isGroup) return false
  if (!global.db?.data?.antiBot?.[m.chat]) return false
  if (m.fromMe || m.isBaileys) return false
  if (esAdmin) return false

  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(() => null)) ||
    {}
  const partes = metadatos.participants || []

  if (esRemitentePainBot(m, conn, partes)) return false

  const part = findGroupParticipant(partes, m, conn)
  if (part?.admin === 'admin' || part?.admin === 'superadmin') return false

  if (isOwnerJid(candidatosJidRemitente(m, conn), conn)) return false

  if (m.key) registrarMsgReciente(m.chat, m.sender, m.key)

  const { score, razones } = puntuarSospechaBot(m)
  if (score < UMBRAL_KICK) return false

  try {
    return await expulsarBot(m, conn, rcanal, score, razones)
  } catch (e) {
    console.error('[antibot]', e?.message || e)
    return false
  }
}

export async function manejarJoinAntiBot(conn, { id, participants, action }) {
  if (action !== 'add' || !id?.endsWith?.('@g.us')) return
  if (!global.db?.data?.antiBot?.[id]) return

  for (const p of participants || []) {
    const jid = conn.decodeJid?.(p) || p
    if (!jid || typeof jid !== 'string') continue
    if (esRemitentePainBot({ sender: jid, key: { participant: jid } }, conn, [])) {
      continue
    }
    registrarJoinAntiBot(id, jid)
    lanzarProbeSilencioso(conn, id, jid).catch(() => {})
  }
}

export {
  manejarAntiBot as handleAntiBot,
  manejarJoinAntiBot as handleAntiBotJoin,
  lanzarProbeSilencioso as launchSilentBotProbe,
  esRemitentePainBot as isPainBotSender,
  puntuarSospechaBot as scoreBotSuspicion
}
