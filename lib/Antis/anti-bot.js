import { readdir } from 'node:fs/promises'
import { join } from 'path'
import { extraerNewsletterDeMensaje } from '../newsletter-rcanal.js'
import {
  findGroupParticipant,
  findCurrentBotParticipant,
  isAdminRole,
  jidsParticipante,
  candidatosJidRemitente,
  recolectarConexionesBot
} from '../group-participant.js'
import { isOwnerJid } from '../resolve-group-target.js'
import { modoAnti, expulsarParticipante } from './anti-modo.js'
import { verificarAdminAnti } from './anti-admin.js'

const UMBRAL_KICK = 8
const VENTANA_JOIN_MS = 120_000
const VENTANA_PROBE_MS = 28_000

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

let cacheSerbot = new Set()
let cacheSerbotHasta = 0
let cargaSerbot = null

async function numerosSerbotEnDisco() {
  const ahora = Date.now()
  if (ahora < cacheSerbotHasta) return cacheSerbot
  if (!cargaSerbot) {
    cargaSerbot = (async () => {
      const nums = new Set()
      let carpetas
      try {
        carpetas = await readdir(join(process.cwd(), global.bot || 'Serbot'), { withFileTypes: true })
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        cacheSerbot = nums
        cacheSerbotHasta = Date.now() + 20_000
        return nums
      }
      for (const nombre of carpetas) {
        if (!nombre.isDirectory()) continue
        const d = digitos(nombre.name)
        if (d.length >= 8) nums.add(d)
      }
      cacheSerbot = nums
      cacheSerbotHasta = Date.now() + 20_000
      return nums
    })()
  }
  const cargaActual = cargaSerbot
  try {
    return await cargaActual
  } catch (error) {
    cacheSerbotHasta = Date.now() + 5_000
    console.error('[antibot] No se pudieron actualizar los números de sub-bots:', error?.message || error)
    return cacheSerbot
  } finally {
    if (cargaSerbot === cargaActual) cargaSerbot = null
  }
}

export async function recolectarIdsPainBot(conn) {
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
  for (const d of await numerosSerbotEnDisco()) agregarId(set, d)
  for (const [n] of global.owner || []) agregarId(set, n)
  for (const [n] of global.ownerLid || []) agregarId(set, n)
  return set
}

export async function esRemitentePainBot(m, conn, participants = []) {
  const idsPain = await recolectarIdsPainBot(conn)
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

function textoPlano(texto = '') {
  let salida = ''
  for (const ch of String(texto)) {
    const cp = ch.codePointAt(0)
    const rangos = [
      [0x1D400, 0x1D419, 65],
      [0x1D41A, 0x1D433, 97],
      [0x1D434, 0x1D44D, 65],
      [0x1D44E, 0x1D467, 97],
      [0x1D468, 0x1D481, 65],
      [0x1D482, 0x1D49B, 97],
      [0x1D5A0, 0x1D5B9, 65],
      [0x1D5BA, 0x1D5D3, 97],
      [0x1D5D4, 0x1D5ED, 65],
      [0x1D5EE, 0x1D607, 97],
      [0x1D608, 0x1D621, 65],
      [0x1D622, 0x1D63B, 97],
      [0x1D63C, 0x1D655, 65],
      [0x1D656, 0x1D66F, 97],
      [0x1D670, 0x1D689, 65],
      [0x1D68A, 0x1D6A3, 97],
    ]
    let plano = null
    for (const [desde, hasta, base] of rangos) {
      if (cp >= desde && cp <= hasta) {
        plano = String.fromCharCode(base + (cp - desde))
        break
      }
    }
    salida += plano || ch
  }
  return salida
}

function textoMensaje(m) {
  const crudo = String(m?.text || m?.msg?.text || m?.msg?.caption || m?.caption || '').trim()
  return textoPlano(crudo)
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
    /el comando\b.{0,48}\bno existe/i.test(texto) ||
    /no\s+existe\s+ese\s+comando/i.test(texto) ||
    /command\s+(not\s+found|does\s+not\s+exist)/i.test(texto) ||
    /the command\b.{0,48}\b(does not exist|not found)/i.test(texto) ||
    /(usa|use|escribe|prueba|ejemplo|please).{0,24}[.#/!]?(menu|help|ayuda)/i.test(texto) ||
    /opci[oó]n\s+no\s+v[aá]lida/i.test(texto) ||
    /para ver (el |a )?lista de comandos/i.test(texto)
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
  const tipos = [
    m?.mtype,
    m?.type,
    ...Object.keys(m?.message || {}),
  ].map(v => String(v || ''))
  return tipos.some(k => /^(buttonsMessage|listMessage|templateMessage|interactiveMessage)$/i.test(k) || /nativeFlowMessage|interactiveMessage/i.test(k))
}

function firmaMd(texto) {
  if (!texto || texto.length < 12) return false
  return /(jadibot|serbot|sub-?bots?|baileys|multi[\s-]?device|bot\s*md|whatsapp\s*bot|prefijo\s+actual)/i.test(texto)
}

function idPareceClienteBot(m) {
  const id = String(m?.key?.id || m?.id || '')
  if (!id || m?.fromMe) return false
  if (/^3EB0/i.test(id)) return true
  if (/^[A-F0-9]{16,32}$/i.test(id) && !/^[0-9]+$/.test(id)) return true
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
  const md = firmaMd(texto)

  if (interactivo && !m?.fromMe) {
    score += 10
    razones.push('botones_o_lista')
  }

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

  if (md && (menu || cmds >= 2 || interactivo || tieneCajaDecorativa(texto))) {
    score += 8
    razones.push('firma_md')
  }

  if (postJoin && (menu || errorCmd || (interactivo && cmds >= 1))) {
    score += 4
    razones.push('firma_post_join')
  }

  if (idBotish && (menu || newsletterAjeno || errorCmd || interactivo || md)) {
    score += 6
    razones.push('id_cliente_bot')
  } else if (idBotish && cmds >= 2) {
    score += 4
    razones.push('id_y_comandos')
  }

  return { score, razones, texto }
}

async function expulsarBot(m, conn, rcanal, score, razones, modo = 'all') {
  const permisos = await verificarAdminAnti(m, conn)
  if (!permisos.puedeModerar) return false
  const partes = permisos.participants
  const botPart = await findCurrentBotParticipant(conn, partes)
  const soyAdmin = isAdminRole(botPart?.admin)
  if (!soyAdmin) return false

  await borrarMsgsDelUsuario(conn, m.chat, m.sender, m.key)

  const expulsa = modo === 'all'
  const expulsado = expulsa
    ? await expulsarParticipante(conn, m.chat, m.sender, 'antibot')
    : false
  await conn.sendMessage(
    m.chat,
    {
      text:
        `*Anti-Bot*\n\n` +
        `> @${String(m.sender).split('@')[0]} detectado como bot ajeno.\n` +
        (expulsa
          ? expulsado
            ? `> Fue eliminado del grupo.`
            : `> No se pudo eliminar; revisa que siga en el grupo y que el bot sea administrador.`
          : `> Sus mensajes fueron eliminados.`),
      contextInfo: {
        ...(rcanal?.contextInfo || {}),
        mentionedJid: [m.sender]
      }
    }
  ).catch(() => {})
  probesActivos.delete(claveUsuario(m.chat, m.sender))
  console.log(`[antibot] ${expulsado ? 'kick' : 'del'} ${m.sender} score=${score} razones=${razones.join(',')}`)
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
  if (await esRemitentePainBot({ sender: userJid, key: { participant: userJid } }, conn, [])) {
    return false
  }

  probesEnCurso.add(clave)
  try {
    await new Promise(r => setTimeout(r, 1800 + Math.floor(Math.random() * 1200)))

    if (!global.db?.data?.antiBot?.[chatId]) return false
    const candidato = { chat: chatId, sender: userJid, isGroup: true, key: { participant: userJid } }
    if (!(await verificarAdminAnti(candidato, conn)).puedeModerar) return false

    const num = digitos(userJid)
    const enviado = await conn.sendMessage(chatId, {
      text: num ? `@${num} .z9chk` : '.z9chk',
      contextInfo: num ? { mentionedJid: [userJid] } : undefined
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

export async function manejarAntiBot(m, conn, esAdmin, rcanal, participants = []) {
  if (!m?.isGroup) return false
  const modo = modoAnti(global.db?.data?.antiBot?.[m.chat], 'all')
  if (modo === 'off') return false
  if (m.fromMe || m.isBaileys) return false

  const metadatos =
    (conn.chats?.[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(() => null)) ||
    {}
  const partes = participants.length ? participants : metadatos.participants || []

  if (await esRemitentePainBot(m, conn, partes)) return false

  if (isOwnerJid(candidatosJidRemitente(m, conn), conn)) return false

  if (m.key) registrarMsgReciente(m.chat, m.sender, m.key)

  const { score, razones } = puntuarSospechaBot(m)
  if (score < UMBRAL_KICK) return false

  try {
    return await expulsarBot(m, conn, rcanal, score, razones, modo)
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
    if (await esRemitentePainBot({ sender: jid, key: { participant: jid } }, conn, [])) {
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
