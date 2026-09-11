import ws from 'ws'
import fs from 'fs'
import { join } from 'path'

export function limpiarNumBot(jidONum = '') {
  return String(jidONum).split('@')[0].split(':')[0].replace(/\D/g, '')
}


export function esConnBotPrincipal(conn) {
  if (!conn) return false
  if (conn === global.conn) return true
  const mio = limpiarNumBot(conn.user?.jid || conn.user?.id)
  const principalConn = limpiarNumBot(global.conn?.user?.jid || global.conn?.user?.id)
  return Boolean(mio && principalConn && mio === principalConn)
}

function decodificarJid(conn, jid) {
  try {
    return conn?.decodeJid?.(jid) || String(jid || '')
  } catch {
    return String(jid || '')
  }
}

function mismoUsuario(a, b) {
  const na = limpiarNumBot(a)
  const nb = limpiarNumBot(b)
  return na.length > 5 && na === nb
}

function botEnParticipantes(connBot, participants = []) {
  if (!connBot?.user) return false
  const jidBot = decodificarJid(connBot, connBot.user.jid || connBot.user.id)
  const numBot = limpiarNumBot(jidBot)
  if (!numBot) return false

  for (const p of participants) {
    const ids = [
      p.id,
      p.jid,
      p.lid,
      p.phoneNumber
    ].filter(Boolean).map(j => {
      const crudo = String(j)
      return crudo.includes('@') ? decodificarJid(connBot, crudo) : `${crudo.replace(/\D/g, '')}@s.whatsapp.net`
    })

    if (ids.some(id => mismoUsuario(id, jidBot) || limpiarNumBot(id) === numBot)) return true
  }
  return false
}

function obtenerNombreVisibleBot(connBot, esPrincipal) {
  if (esPrincipal) return global.namebot || 'Bot Principal'
  try {
    const num = limpiarNumBot(connBot.user?.jid)
    const rutaConfig = join('./Serbot', num, 'config.json')
    if (fs.existsSync(rutaConfig)) {
      const config = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
      if (config.name) return config.name
    }
  } catch {}
  return 'Sub-Bot'
}

/**
 * Lista bots (principal + subbots) presentes en el grupo.
 */
export function listarBotsEnGrupo(participants = []) {
  const bots = []
  const principalConn = global.conn

  if (principalConn?.user && botEnParticipantes(principalConn, participants)) {
    bots.push({
      index: bots.length + 1,
      type: 'principal',
      number: limpiarNumBot(principalConn.user.jid || principalConn.user.id),
      name: obtenerNombreVisibleBot(principalConn, true),
      conn: principalConn
    })
  }

  const subs = (global.conns || []).filter(c =>
    c?.user &&
    c.ws?.socket?.readyState === ws.OPEN &&
    c !== principalConn
  )

  for (const sub of subs) {
    if (!botEnParticipantes(sub, participants)) continue
    bots.push({
      index: bots.length + 1,
      type: 'subbot',
      number: limpiarNumBot(sub.user.jid || sub.user.id),
      name: obtenerNombreVisibleBot(sub, false),
      conn: sub
    })
  }

  return bots
}

export function obtenerBotActivoDelGrupo(idChat) {
  if (!global.db.data.modoSub) global.db.data.modoSub = {}
  const value = global.db.data.modoSub[idChat]
  if (!value || value === 'all' || value === true) return null
  return String(value).replace(/\D/g, '') || null
}

export function establecerBotActivoDelGrupo(idChat, numeroBotOTodos) {
  if (!global.db.data.modoSub) global.db.data.modoSub = {}
  if (!numeroBotOTodos || numeroBotOTodos === 'all' || numeroBotOTodos === 'off') {
    delete global.db.data.modoSub[idChat]
    return null
  }
  const num = String(numeroBotOTodos).replace(/\D/g, '')
  global.db.data.modoSub[idChat] = num
  return num
}

/** Números de principal + subbots conectados. */
export function listarNumerosBotsConocidos() {
  const nums = new Set()
  const agregar = (jid) => {
    const n = limpiarNumBot(jid)
    if (n && n.length >= 6) nums.add(n)
  }
  agregar(global.conn?.user?.jid || global.conn?.user?.id)
  for (const c of global.conns || []) {
    agregar(c?.user?.jid || c?.user?.id)
  }
  return nums
}

export function esNumeroBotConocido(jidONum) {
  const n = limpiarNumBot(jidONum)
  if (!n || n.length < 6) return false
  return listarNumerosBotsConocidos().has(n)
}

function extraerNumRemitenteGrupo(conn, msgCrudo) {
  const key = msgCrudo?.key || {}
  if (key.fromMe) {
    return limpiarNumBot(conn?.user?.jid || conn?.user?.id)
  }
  const candidatos = [
    key.participantPn,
    key.participant,
    key.participantAlt,
    msgCrudo?.participant,
  ].filter(Boolean)

  for (const crudo of candidatos) {
    const decodificado = decodificarJid(conn, crudo)
    const n = limpiarNumBot(decodificado)
    if (n.length >= 6) return n
  }
  return ''
}

function esTextoComandoModoSub(text = '', prefix = '.') {
  if (!text) return false
  const strARegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefijos = Array.isArray(global.prefix) ? global.prefix : [global.prefix || prefix]
  for (const p of prefijos) {
    const re = p instanceof RegExp ? p : new RegExp('^' + strARegex(String(p)))
    if (!re.test(text)) continue
    const cuerpo = text.replace(re, '').trim()
    const cmd = cuerpo.split(/\s+/)[0]?.toLowerCase() || ''
    if (['modosub', 'modobot', 'botactivo', 'onlybot'].includes(cmd)) return true
  }
  return false
}


export function extraerTextoMensajeCrudo(msgCrudo) {
  try {
    const raiz = msgCrudo?.message
    if (!raiz) return ''

    const desenvolver = (msg) => {
      if (!msg || typeof msg !== 'object') return msg
      return (
        msg.ephemeralMessage?.message ||
        msg.viewOnceMessage?.message ||
        msg.viewOnceMessageV2?.message ||
        msg
      )
    }

    const msg = desenvolver(raiz)
    if (typeof msg === 'string') return msg

    const directo =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.buttonsResponseMessage?.selectedButtonId ||
      msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.templateButtonReplyMessage?.selectedId ||
      ''

    if (directo) return String(directo)

    for (const value of Object.values(msg)) {
      if (!value || typeof value !== 'object') continue
      if (value.message) {
        const anidado = extraerTextoMensajeCrudo({ message: value.message })
        if (anidado) return anidado
      }
      if (typeof value.text === 'string' && value.text) return value.text
      if (typeof value.caption === 'string' && value.caption) return value.caption
    }

    return ''
  } catch {
    return ''
  }
}

/**
 * Filtro temprano: true = este socket no debe procesar nada en el grupo.
 * Se usa ANTES de pushMessage, DB, plugins y finally.
 *
 * Reglas:
 * 1) Si hay bot activo (/modosub N): SOLO ese bot procesa (también si escribe desde su propio número).
 * 2) Si está en "all": un mensaje escrito desde un bot lo atiende solo ese bot (fromMe),
 *    los demás ignoran para no duplicar /rw, menús, etc.
 * 3) /modosub siempre se deja pasar en todos (para poder cambiar el activo).
 */
export function debeOmitirMensajeGrupoTemprano(conn, msgCrudo) {
  if (!msgCrudo?.key) return false

  const idChat = conn?.decodeJid?.(msgCrudo.key.remoteJid) || msgCrudo.key.remoteJid || ''
  if (!String(idChat).endsWith('@g.us')) return false
  if (!global.db?.data) return false

  const miNum = limpiarNumBot(conn?.user?.jid || conn?.user?.id)
  if (!miNum) return false

  const text = extraerTextoMensajeCrudo(msgCrudo)
  if (esTextoComandoModoSub(text)) return false

  const activo = obtenerBotActivoDelGrupo(idChat)
  const desdeMi = Boolean(msgCrudo.key.fromMe)

  // Bot único elegido: los demás (incluido fromMe de otro subbot) no ejecutan nada
  if (activo) {
    return miNum !== activo
  }

  // Modo all: evita que principal + sub ejecuten el mismo comando escrito desde un bot
  if (!desdeMi) {
    const numRemitente = extraerNumRemitenteGrupo(conn, msgCrudo)
    if (numRemitente && esNumeroBotConocido(numRemitente)) return true
  }

  return false
}

/**
 * true = este socket NO debe responder en el grupo (otro bot está elegido)
 */
export function debeOmitirPorModoSub(conn, idChat, { allowModoSubCommand = false, text = '', prefix = '.' } = {}) {
  if (!idChat || !String(idChat).endsWith('@g.us')) return false

  const activo = obtenerBotActivoDelGrupo(idChat)
  if (!activo) return false

  const miNum = limpiarNumBot(conn?.user?.jid || conn?.user?.id)
  if (miNum && miNum === activo) return false

  if (allowModoSubCommand && esTextoComandoModoSub(text, prefix)) return false

  return true
}

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isOwner, participants, groupMetadata }) => {
  if (!m.isGroup) {
    return m.reply('[❗] Este comando solo funciona en grupos.')
  }

  if (!isAdmin && !isOwner && !m.fromMe) {
    return m.reply('[❗] Solo admins y owners pueden usar este comando.')
  }

  let participantesGrupo = participants || []
  try {
    const fresco = await conn.groupMetadata(m.chat)
    if (fresco?.participants?.length) participantesGrupo = fresco.participants
  } catch {}

  const bots = listarBotsEnGrupo(participantesGrupo)
  if (!bots.length) {
    return m.reply('[❗] No detecté bots (principal/sub) en este grupo.')
  }

  const accion = (args[0] || '').toLowerCase().trim()

  if (!accion) {
    const activo = obtenerBotActivoDelGrupo(m.chat)
    let textoMsg = `*Modo Sub / Bot activo*\n\n`
    textoMsg += `Elige qué bot responde en este grupo.\n`
    textoMsg += `Uso: *${usedPrefix}modosub <número>*\n`
    textoMsg += `Todos: *${usedPrefix}modosub all*\n\n`

    for (const bot of bots) {
      const etiqueta = bot.type === 'principal' ? 'Principal' : 'Sub-Bot'
      const activoMarca = activo && activo === bot.number ? ' ✅ *ACTIVO*' : ''
      textoMsg += `*${bot.index}.* ${etiqueta} — ${bot.name}\n`
      textoMsg += `   └ +${bot.number}${activoMarca}\n`
    }

    if (activo) {
      const actual = bots.find(b => b.number === activo)
      textoMsg += `\n> Ahora solo responde: *${actual ? `${actual.index} (${actual.name})` : activo}*`
    } else {
      textoMsg += `\n> Ahora responden *todos* los bots del grupo.`
    }

    return conn.sendMessage(m.chat, {
      text: textoMsg,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  if (['all', 'off', 'todos', 'reset'].includes(accion)) {
    establecerBotActivoDelGrupo(m.chat, 'all')
    await global.db.write?.()
    return m.reply('✅ Modo Sub desactivado.\n> Todos los bots del grupo pueden responder otra vez.')
  }

  const indice = parseInt(accion, 10)
  if (!Number.isFinite(indice) || indice < 1 || indice > bots.length) {
    return m.reply(`[❗] Número inválido.\n\nUsa *${usedPrefix}modosub* para ver la lista\no *${usedPrefix}modosub 1* / *${usedPrefix}modosub all*`)
  }

  const seleccionado = bots[indice - 1]
  establecerBotActivoDelGrupo(m.chat, seleccionado.number)
  await global.db.write?.()

  const etiqueta = seleccionado.type === 'principal' ? 'Bot Principal' : 'Sub-Bot'
  return m.reply(`✅ Ahora solo responde en este grupo:\n\n*${indice}.* ${etiqueta} — ${seleccionado.name}\n> +${seleccionado.number}\n\n> Los demás bots ignoran comandos aquí (también si escriben desde su propio número).\n> Para volver a todos: *${usedPrefix}modosub all*`)
}

handler.command = ['modosub', 'modobot', 'botactivo', 'onlybot']
handler.help = ['modosub', 'modosub <n>', 'modosub all']
handler.tags = ['grupo', 'subbots']
handler.group = true
handler.admin = true

export default handler

export {
  limpiarNumBot as cleanBotNum,
  esConnBotPrincipal as isMainBotConn,
  listarBotsEnGrupo as listBotsInGroup,
  obtenerBotActivoDelGrupo as getActiveBotForGroup,
  establecerBotActivoDelGrupo as setActiveBotForGroup,
  listarNumerosBotsConocidos as listKnownBotNumbers,
  esNumeroBotConocido as isKnownBotNumber,
  extraerTextoMensajeCrudo as extractRawMessageText,
  debeOmitirMensajeGrupoTemprano as shouldSkipGroupMessageEarly,
  debeOmitirPorModoSub as shouldSkipByModoSub
}
