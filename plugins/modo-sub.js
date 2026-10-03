import ws from 'ws'
import fs from 'fs'
import { join, basename } from 'path'
import {
  algunParticipanteCoincideConIds,
  participanteCoincideConIdentidadActiva
} from '../lib/group-participant.js'

export function limpiarNumBot(jidONum = '') {
  return String(jidONum).split('@')[0].split(':')[0].replace(/\D/g, '')
}

/**
 * Todas las identidades numéricas de un socket (PN + LID + carpeta Serbot).
 * WhatsApp LID hace que user.jid ya no sea el teléfono: sin esto, modosub
 * compara mal y el bot "activo" se salta a sí mismo.
 */
export function numerosIdentidadBot(conn) {
  if (!conn) return new Set()
  const marca = [
    conn.user?.jid,
    conn.user?.id,
    conn.user?.lid,
    conn.phoneNumber,
    conn.botNumber,
    conn.pathAYBot,
  ].join('|')
  if (conn._idsBot && conn._idsBotMarca === marca) return conn._idsBot

  const nums = new Set()
  const agregar = (v) => {
    const n = limpiarNumBot(v)
    if (n && n.length >= 6) nums.add(n)
  }
  agregar(conn.user?.jid)
  agregar(conn.user?.id)
  agregar(conn.user?.lid)
  agregar(conn.authState?.creds?.me?.id)
  agregar(conn.authState?.creds?.me?.jid)
  agregar(conn.authState?.creds?.me?.lid)
  agregar(conn.phoneNumber)
  agregar(conn.botNumber)
  if (conn.pathAYBot) {
    try { agregar(basename(conn.pathAYBot)) } catch {}
  }
  conn._idsBotMarca = marca
  conn._idsBot = nums
  return nums
}

export function esConnBotPrincipal(conn) {
  if (!conn) return false
  if (conn === global.conn) return true
  const mios = numerosIdentidadBot(conn)
  const principales = numerosIdentidadBot(global.conn)
  for (const n of mios) {
    if (principales.has(n)) return true
  }
  return false
}

/** ¿Este socket es el bot activo del grupo? (null activo = modo all → sí). */
export function esteBotCoincideConActivo(conn, activo, participants = []) {
  if (!activo) return true
  const ids = numerosIdentidadBot(conn)
  if (ids.has(activo)) return true
  return participanteCoincideConIdentidadActiva(ids, activo, participants, conn)
}

/** Número estable para modosub (preferir teléfono real, no LID). */
export function numeroPublicoBot(connBot, participants = []) {
  if (connBot?.phoneNumber) {
    const n = limpiarNumBot(connBot.phoneNumber)
    if (n.length >= 6) return n
  }
  if (connBot?.botNumber) {
    const n = limpiarNumBot(connBot.botNumber)
    if (n.length >= 6) return n
  }
  if (connBot?.pathAYBot) {
    try {
      const n = limpiarNumBot(basename(connBot.pathAYBot))
      if (n.length >= 6) return n
    } catch {}
  }

  const ids = numerosIdentidadBot(connBot)
  for (const p of participants || []) {
    const phone = limpiarNumBot(p?.phoneNumber)
    if (phone.length < 6) continue
    const digitosPart = [p?.id, p?.jid, p?.lid, p?.phoneNumber].map(limpiarNumBot)
    if (digitosPart.some(d => ids.has(d))) return phone
  }

  const jid = String(connBot?.user?.jid || connBot?.user?.id || '')
  if (jid && !jid.includes('@lid')) {
    const n = limpiarNumBot(jid)
    if (n.length >= 6) return n
  }

  for (const n of ids) {
    if (n.length >= 8 && n.length <= 15) return n
  }
  return [...ids][0] || ''
}

function decodificarJid(conn, jid) {
  try {
    return conn?.decodeJid?.(jid) || String(jid || '')
  } catch {
    return String(jid || '')
  }
}

function botEnParticipantes(connBot, participants = []) {
  if (!connBot?.user) return false
  const idsBot = numerosIdentidadBot(connBot)
  return idsBot.size > 0 && algunParticipanteCoincideConIds(idsBot, participants, connBot)
}

function obtenerNombreVisibleBot(connBot, esPrincipal) {
  if (esPrincipal) return global.namebot || 'Bot Principal'
  try {
    const num = numeroPublicoBot(connBot) || limpiarNumBot(connBot.user?.jid)
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
      number: numeroPublicoBot(principalConn, participants),
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
      number: numeroPublicoBot(sub, participants),
      name: obtenerNombreVisibleBot(sub, false),
      conn: sub
    })
  }

  return bots
}

export function obtenerBotActivoDelGrupo(idChat) {
  const datos = global.db?.data
  if (!datos) return null
  if (!datos.modoSub || typeof datos.modoSub !== 'object') datos.modoSub = {}
  const value = datos.modoSub[idChat]
  if (!value || value === 'all' || value === true) return null
  return String(value).replace(/\D/g, '') || null
}

export function establecerBotActivoDelGrupo(idChat, numeroBotOTodos) {
  const datos = global.db?.data
  if (!datos) return null
  if (!datos.modoSub || typeof datos.modoSub !== 'object') datos.modoSub = {}
  if (!numeroBotOTodos || numeroBotOTodos === 'all' || numeroBotOTodos === 'off') {
    delete datos.modoSub[idChat]
    return null
  }
  const num = String(numeroBotOTodos).replace(/\D/g, '')
  datos.modoSub[idChat] = num
  return num
}

let cacheBotsConocidos = null
let cacheBotsHasta = 0
let cacheBotsLargo = -1

/** Números de principal + subbots conectados (PN + LID + carpeta). */
export function listarNumerosBotsConocidos() {
  const lista = global.conns || []
  const ahora = Date.now()
  if (cacheBotsConocidos && cacheBotsLargo === lista.length && ahora < cacheBotsHasta) {
    return cacheBotsConocidos
  }

  const nums = new Set()
  for (const n of numerosIdentidadBot(global.conn)) nums.add(n)
  for (const c of lista) {
    for (const n of numerosIdentidadBot(c)) nums.add(n)
  }
  cacheBotsConocidos = nums
  cacheBotsLargo = lista.length
  cacheBotsHasta = ahora + 5000
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

/** Media que el anti debe poder borrar aunque lo mande otro Pain/subbot. */
function esMensajeMediaAntiCrudo(msgCrudo) {
  try {
    let msg = msgCrudo?.message
    if (!msg || typeof msg !== 'object') return false
    for (let i = 0; i < 8; i++) {
      if (msg.ephemeralMessage?.message) { msg = msg.ephemeralMessage.message; continue }
      if (msg.viewOnceMessage?.message) { msg = msg.viewOnceMessage.message; continue }
      if (msg.viewOnceMessageV2?.message) { msg = msg.viewOnceMessageV2.message; continue }
      if (msg.viewOnceMessageV2Extension?.message) { msg = msg.viewOnceMessageV2Extension.message; continue }
      if (msg.lottieStickerMessage?.message) { msg = msg.lottieStickerMessage.message; continue }
      if (msg.documentWithCaptionMessage?.message) { msg = msg.documentWithCaptionMessage.message; continue }
      break
    }
    return !!(
      msg.stickerMessage ||
      msg.lottieStickerMessage ||
      msg.imageMessage ||
      msg.videoMessage ||
      msg.audioMessage ||
      msg.documentMessage
    )
  } catch {
    return false
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
 *    EXCEPCIÓN: stickers/imgs/etc. de otro Pain — el bot responsable SÍ los procesa (anti).
 * 3) /modosub siempre se deja pasar en todos (para poder cambiar el activo).
 */
export function debeOmitirMensajeGrupoTemprano(conn, msgCrudo) {
  if (!msgCrudo?.key) return false

  const idChat = conn?.decodeJid?.(msgCrudo.key.remoteJid) || msgCrudo.key.remoteJid || ''
  if (!String(idChat).endsWith('@g.us')) return false
  if (!global.db?.data) return false

  const misIds = numerosIdentidadBot(conn)
  if (!misIds.size) return false

  const text = extraerTextoMensajeCrudo(msgCrudo)
  if (esTextoComandoModoSub(text)) return false

  const activo = obtenerBotActivoDelGrupo(idChat)
  const desdeMi = Boolean(msgCrudo.key.fromMe)
  const partes = conn?.chats?.[idChat]?.metadata?.participants || []

  // Bot único elegido: los demás (incluido fromMe de otro subbot) no ejecutan nada
  if (activo) {
    return !esteBotCoincideConActivo(conn, activo, partes)
  }

  // Modo all: evita duplicar comandos entre bots…
  if (!desdeMi) {
    const numRemitente = extraerNumRemitenteGrupo(conn, msgCrudo)
    if (numRemitente && esNumeroBotConocido(numRemitente)) {
      // …pero el responsable debe ver media de otros Pain para poder borrarla
      if (esMensajeMediaAntiCrudo(msgCrudo) && esteBotEsResponsableDelGrupo(conn, idChat, partes)) {
        return false
      }
      return true
    }
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

  const partes = conn?.chats?.[idChat]?.metadata?.participants || []
  if (esteBotCoincideConActivo(conn, activo, partes)) return false

  if (allowModoSubCommand && esTextoComandoModoSub(text, prefix)) return false

  return true
}

function mismoSocketConn(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const A = numerosIdentidadBot(a)
  const B = numerosIdentidadBot(b)
  for (const n of A) if (B.has(n)) return true
  return false
}

/**
 * Un solo bot “dueño” del grupo para antis / borrados.
 * 1) Si hay /modosub N → ese bot
 * 2) Si está en all → principal (si está en el grupo), si no el sub con número más bajo
 */
export function elegirBotResponsableGrupo(idChat, participants = []) {
  const bots = listarBotsEnGrupo(participants)
  if (!bots.length) return null

  const activo = obtenerBotActivoDelGrupo(idChat)
  if (activo) {
    const elegido = bots.find(b =>
      b.number === activo ||
      esteBotCoincideConActivo(b.conn, activo, participants)
    )
    if (elegido) return elegido.conn
  }

  const principal = bots.find(b => b.type === 'principal')
  if (principal) return principal.conn

  return [...bots].sort((a, b) => String(a.number).localeCompare(String(b.number)))[0]?.conn || null
}

/** ¿Este socket es el que debe aplicar anti-media / borrados en el grupo? */
export function esteBotEsResponsableDelGrupo(conn, idChat, participants = []) {
  const responsable = elegirBotResponsableGrupo(idChat, participants)
  if (!responsable) return true
  return mismoSocketConn(conn, responsable)
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
  numerosIdentidadBot as botIdentityNumbers,
  numeroPublicoBot as publicBotNumber,
  esteBotCoincideConActivo as thisBotMatchesActive,
  elegirBotResponsableGrupo as pickGroupResponsibleBot,
  esteBotEsResponsableDelGrupo as isGroupResponsibleBot,
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
