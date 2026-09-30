import fs from 'fs'
import path from 'path'
import ws from 'ws'
import { esOwnerConfig, esDuenoPrincipal, esBotPrincipal, numeroBotDe } from '../lib/staff.js'
import { cleanBotNum, numerosIdentidadBot, numeroPublicoBot } from './modo-sub.js'
import { resolvePhoneNumber } from '../lib/resolve-phone.js'
import { candidatosJidRemitente, jidsSeSolapan } from '../lib/group-participant.js'

function dirSerbot() {
  return path.join(process.cwd(), global.bot || 'Serbot')
}

function rutaSesionSub(num) {
  return path.join(dirSerbot(), String(num))
}

function digitos(v = '') {
  return String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function idsDeNumero(num) {
  const n = digitos(num)
  if (n.length < 6) return []
  return [
    n,
    `${n}@s.whatsapp.net`,
    `${n}@lid`,
    `${n}@hosted.lid`,
  ]
}

/** Dueño real del subbot = el número vinculado (carpeta), no el staff /mod. */
function esDueñoNumeroSubbot(m, conn, numSub) {
  const n = digitos(numSub)
  if (n.length < 6) return false
  return jidsSeSolapan(candidatosJidRemitente(m, conn), idsDeNumero(n))
}

function listarSubsConectados() {
  const lista = []
  const vistos = new Set()
  for (const c of global.conns || []) {
    if (!c?.user) continue
    if (c.ws?.socket && c.ws.socket.readyState !== ws.OPEN) continue
    const num =
      digitos(c.phoneNumber || c.botNumber) ||
      (c.pathAYBot ? digitos(path.basename(c.pathAYBot)) : '') ||
      numeroPublicoBot(c) ||
      digitos(c.user?.jid || c.user?.id)
    if (!num || vistos.has(num)) continue
    if (esBotPrincipal(c)) continue
    vistos.add(num)
    lista.push({ num, conn: c, online: true })
  }
  return lista
}

function listarSubsEnDisco() {
  const raiz = dirSerbot()
  if (!fs.existsSync(raiz)) return []
  const out = []
  for (const nombre of fs.readdirSync(raiz)) {
    const n = digitos(nombre)
    if (n.length < 8) continue
    const ruta = path.join(raiz, nombre)
    try {
      if (!fs.statSync(ruta).isDirectory()) continue
      if (!fs.existsSync(path.join(ruta, 'creds.json'))) continue
    } catch {
      continue
    }
    out.push(n)
  }
  return out
}

function buscarConnSub(num) {
  const n = digitos(num)
  for (const c of global.conns || []) {
    if (!c?.user) continue
    if (esBotPrincipal(c)) continue
    const ids = numerosIdentidadBot(c)
    if (ids.has(n)) return c
    if (digitos(c.phoneNumber || c.botNumber) === n) return c
    if (c.pathAYBot && digitos(path.basename(c.pathAYBot)) === n) return c
  }
  return null
}

async function eliminarSesionSubBot(num) {
  const n = digitos(num)
  if (!n || n.length < 8) throw new Error('Número de subbot inválido')

  const principalNum =
    digitos(global.conn?.phoneNumber || global.conn?.botNumber) ||
    numeroBotDe(global.conn) ||
    ''
  if (principalNum && principalNum === n) {
    throw new Error('No se puede eliminar la sesión del bot principal')
  }

  const sock = buscarConnSub(n)
  if (sock) {
    try { await sock.logout?.() } catch {}
    try { sock.ev?.removeAllListeners?.() } catch {}
    try { sock.ws?.close?.() } catch {}
    try { sock.end?.() } catch {}
    if (Array.isArray(global.conns)) {
      global.conns = global.conns.filter(c => c !== sock)
    }
  }

  const ruta = rutaSesionSub(n)
  if (fs.existsSync(ruta)) {
    // Quita creds/sesión; deja config/staff/soporte por si vuelve a vincular
    const preservar = new Set(['config.json', 'staff.json', 'soporte.json'])
    for (const entrada of fs.readdirSync(ruta)) {
      if (preservar.has(entrada)) continue
      fs.rmSync(path.join(ruta, entrada), { recursive: true, force: true })
    }
    // Si ya no queda nada útil salvo vacíos, igual la sesión quedó muerta
    const quedaCreds = fs.existsSync(path.join(ruta, 'creds.json'))
    if (quedaCreds) {
      fs.rmSync(path.join(ruta, 'creds.json'), { force: true })
    }
  }

  return { num: n, estabaConectado: Boolean(sock) }
}

function ayuda(usedPrefix) {
  return `*Eliminar sesión de subbot*\n\n` +
    `*Tu sesión:*\n` +
    `> ${usedPrefix}delsession\n\n` +
    `*Owner principal:*\n` +
    `> ${usedPrefix}delsession <número>\n` +
    `> ${usedPrefix}delsession <índice>\n` +
    `> ${usedPrefix}delsession lista`
}

let handler = async (m, { conn, args, usedPrefix, command, participants }) => {
  const esOwnerGlobal = esDuenoPrincipal(m, conn) || esOwnerConfig(m, conn)
  const partes = m.isGroup
    ? (((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(() => null))?.participants || participants || [])
    : []

  let miTelefono = ''
  try {
    miTelefono = await resolvePhoneNumber(m.sender, conn, null, m, {
      participants: partes,
      groupId: m.isGroup ? m.chat : null,
    }) || ''
  } catch {}
  miTelefono = digitos(miTelefono)
  if (!miTelefono || miTelefono.length < 8) {
    miTelefono = digitos(m.sender)
    // Si sender es LID largo, no usarlo como carpeta
    if (miTelefono.length > 15) miTelefono = ''
  }

  const sub = String(args[0] || '').toLowerCase().trim()

  if (['lista', 'list', 'ver'].includes(sub)) {
    if (!esOwnerGlobal) {
      return conn.reply(m.chat, '[❗] Solo owners pueden ver la lista de sesiones.', m)
    }
    const online = listarSubsConectados()
    const disco = listarSubsEnDisco()
    const nums = new Set([...online.map(o => o.num), ...disco])
    if (!nums.size) {
      return conn.reply(m.chat, '[❗] No hay sesiones de subbot.', m)
    }
    let texto = `*Sesiones subbot*\n\n`
    let i = 1
    for (const n of [...nums].sort()) {
      const on = online.some(o => o.num === n)
      texto += `*${i}.* +${n} ${on ? '🟢' : '⚪'}\n`
      i++
    }
    texto += `\n> ${usedPrefix}${command} <número|índice>`
    return conn.reply(m.chat, texto, m)
  }

  let objetivo = ''

  if (!sub) {
    // 1) Si estás en un subbot y eres su dueño (o owner global) → ese
    if (!esBotPrincipal(conn)) {
      const numEste =
        digitos(conn.phoneNumber || conn.botNumber) ||
        (conn.pathAYBot ? digitos(path.basename(conn.pathAYBot)) : '') ||
        numeroPublicoBot(conn) ||
        numeroBotDe(conn)
      if (numEste && (esOwnerGlobal || esDueñoNumeroSubbot(m, conn, numEste))) {
        objetivo = numEste
      }
    }
    // 2) Sesión vinculada a tu número
    if (!objetivo && miTelefono && fs.existsSync(rutaSesionSub(miTelefono))) {
      objetivo = miTelefono
    }
    if (!objetivo) {
      return conn.reply(m.chat, ayuda(usedPrefix), m)
    }
  } else {
    const soloDigitos = digitos(sub)
    const online = listarSubsConectados()
    const disco = listarSubsEnDisco()
    const todos = [...new Set([...online.map(o => o.num), ...disco])].sort()

    const indice = parseInt(sub, 10)
    if (!soloDigitos && Number.isFinite(indice)) {
      // fallthrough
    }
    if (/^\d+$/.test(sub) && sub.length <= 3 && indice >= 1 && indice <= todos.length) {
      objetivo = todos[indice - 1]
    } else if (soloDigitos.length >= 8) {
      objetivo = soloDigitos
    } else {
      return conn.reply(m.chat, `[❗] Número o índice inválido.\n\n${ayuda(usedPrefix)}`, m)
    }
  }

  if (!objetivo) {
    return conn.reply(m.chat, ayuda(usedPrefix), m)
  }

  const ruta = rutaSesionSub(objetivo)
  const conectado = Boolean(buscarConnSub(objetivo))
  if (!conectado && !fs.existsSync(ruta)) {
    return conn.reply(m.chat, `[❗] No hay sesión para +${objetivo}.`, m)
  }

  // Permisos: owner global → cualquiera; si no, solo tu propio subbot
  if (!esOwnerGlobal) {
    const esMio =
      (miTelefono && miTelefono === objetivo) ||
      esDueñoNumeroSubbot(m, conn, objetivo)
    if (!esMio) {
      return conn.reply(
        m.chat,
        '[❗] Solo puedes eliminar *tu* sesión de subbot.\n> Los owners del bot principal pueden eliminar cualquiera.',
        m
      )
    }
  }

  try {
    const { num, estabaConectado } = await eliminarSesionSubBot(objetivo)
    return conn.reply(
      m.chat,
      `✅ Sesión eliminada: *+${num}*\n` +
        `> ${estabaConectado ? 'Desconectado y credenciales borradas.' : 'Credenciales borradas.'}\n` +
        `> Para volver: ${usedPrefix}code / ${usedPrefix}qr`,
      m
    )
  } catch (e) {
    console.error('[delsession]', e)
    return conn.reply(m.chat, `[❌] No se pudo eliminar: ${e?.message || e}`, m)
  }
}

handler.help = ['delsession', 'delsession <número>', 'delsession lista']
handler.tags = ['serbot']
handler.command = [
  'delsession',
  'delssesion',
  'deletesession',
  'eliminarsesion',
  'delsub',
  'borrarsesion',
  'logoutbot',
]

export default handler
