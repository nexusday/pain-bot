import ws from 'ws'
import fs from 'fs'
import { join } from 'path'

export function cleanBotNum(jidOrNum = '') {
  return String(jidOrNum).split('@')[0].split(':')[0].replace(/\D/g, '')
}

/** Detecta bot principal real (igual que modosub), sin número hardcodeado */
export function isMainBotConn(conn) {
  if (!conn) return false
  if (conn === global.conn) return true
  const mine = cleanBotNum(conn.user?.jid || conn.user?.id)
  const main = cleanBotNum(global.conn?.user?.jid || global.conn?.user?.id)
  return Boolean(mine && main && mine === main)
}

function decodeJid(conn, jid) {
  try {
    return conn?.decodeJid?.(jid) || String(jid || '')
  } catch {
    return String(jid || '')
  }
}

function sameUser(a, b) {
  const na = cleanBotNum(a)
  const nb = cleanBotNum(b)
  return na.length > 5 && na === nb
}

function botInParticipants(botConn, participants = []) {
  if (!botConn?.user) return false
  const botJid = decodeJid(botConn, botConn.user.jid || botConn.user.id)
  const botNum = cleanBotNum(botJid)
  if (!botNum) return false

  for (const p of participants) {
    const ids = [
      p.id,
      p.jid,
      p.lid,
      p.phoneNumber
    ].filter(Boolean).map(j => {
      const raw = String(j)
      return raw.includes('@') ? decodeJid(botConn, raw) : `${raw.replace(/\D/g, '')}@s.whatsapp.net`
    })

    if (ids.some(id => sameUser(id, botJid) || cleanBotNum(id) === botNum)) return true
  }
  return false
}

function getBotDisplayName(botConn, isMain) {
  if (isMain) return global.namebot || 'Bot Principal'
  try {
    const num = cleanBotNum(botConn.user?.jid)
    const configPath = join('./Serbot', num, 'config.json')
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.name) return config.name
    }
  } catch {}
  return 'Sub-Bot'
}

/**
 * Lista bots (principal + subbots) presentes en el grupo.
 */
export function listBotsInGroup(participants = []) {
  const bots = []
  const main = global.conn

  if (main?.user && botInParticipants(main, participants)) {
    bots.push({
      index: bots.length + 1,
      type: 'principal',
      number: cleanBotNum(main.user.jid || main.user.id),
      name: getBotDisplayName(main, true),
      conn: main
    })
  }

  const subs = (global.conns || []).filter(c =>
    c?.user &&
    c.ws?.socket?.readyState === ws.OPEN &&
    c !== main
  )

  for (const sub of subs) {
    if (!botInParticipants(sub, participants)) continue
    bots.push({
      index: bots.length + 1,
      type: 'subbot',
      number: cleanBotNum(sub.user.jid || sub.user.id),
      name: getBotDisplayName(sub, false),
      conn: sub
    })
  }

  return bots
}

export function getActiveBotForGroup(chatId) {
  if (!global.db.data.modoSub) global.db.data.modoSub = {}
  const value = global.db.data.modoSub[chatId]
  if (!value || value === 'all' || value === true) return null
  return String(value).replace(/\D/g, '') || null
}

export function setActiveBotForGroup(chatId, botNumberOrAll) {
  if (!global.db.data.modoSub) global.db.data.modoSub = {}
  if (!botNumberOrAll || botNumberOrAll === 'all' || botNumberOrAll === 'off') {
    delete global.db.data.modoSub[chatId]
    return null
  }
  const num = String(botNumberOrAll).replace(/\D/g, '')
  global.db.data.modoSub[chatId] = num
  return num
}

/**
 * true = este socket NO debe responder en el grupo (otro bot está elegido)
 */
export function shouldSkipByModoSub(conn, chatId, { allowModoSubCommand = false, text = '', prefix = '.' } = {}) {
  if (!chatId || !String(chatId).endsWith('@g.us')) return false

  const active = getActiveBotForGroup(chatId)
  if (!active) return false

  const myNum = cleanBotNum(conn?.user?.jid || conn?.user?.id)
  if (myNum && myNum === active) return false

  if (allowModoSubCommand && text) {
    const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    const prefixes = Array.isArray(global.prefix) ? global.prefix : [global.prefix || prefix]
    for (const p of prefixes) {
      const re = p instanceof RegExp ? p : new RegExp('^' + str2Regex(String(p)))
      if (!re.test(text)) continue
      const body = text.replace(re, '').trim()
      const cmd = body.split(/\s+/)[0]?.toLowerCase() || ''
      if (['modosub', 'modobot', 'botactivo', 'onlybot'].includes(cmd)) return false
    }
  }

  return true
}

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isOwner, participants, groupMetadata }) => {
  if (!m.isGroup) {
    return m.reply('[❗] Este comando solo funciona en grupos.')
  }

  if (!isAdmin && !isOwner && !m.fromMe) {
    return m.reply('[❗] Solo admins y owners pueden usar este comando.')
  }

  let groupParticipants = participants || []
  try {
    const fresh = await conn.groupMetadata(m.chat)
    if (fresh?.participants?.length) groupParticipants = fresh.participants
  } catch {}

  const bots = listBotsInGroup(groupParticipants)
  if (!bots.length) {
    return m.reply('[❗] No detecté bots (principal/sub) en este grupo.')
  }

  const action = (args[0] || '').toLowerCase().trim()

  if (!action) {
    const active = getActiveBotForGroup(m.chat)
    let txt = `*Modo Sub / Bot activo*\n\n`
    txt += `Elige qué bot responde en este grupo.\n`
    txt += `Uso: *${usedPrefix}modosub <número>*\n`
    txt += `Todos: *${usedPrefix}modosub all*\n\n`

    for (const bot of bots) {
      const tag = bot.type === 'principal' ? 'Principal' : 'Sub-Bot'
      const on = active && active === bot.number ? ' ✅ *ACTIVO*' : ''
      txt += `*${bot.index}.* ${tag} — ${bot.name}\n`
      txt += `   └ +${bot.number}${on}\n`
    }

    if (active) {
      const current = bots.find(b => b.number === active)
      txt += `\n> Ahora solo responde: *${current ? `${current.index} (${current.name})` : active}*`
    } else {
      txt += `\n> Ahora responden *todos* los bots del grupo.`
    }

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  if (['all', 'off', 'todos', 'reset'].includes(action)) {
    setActiveBotForGroup(m.chat, 'all')
    await global.db.write?.()
    return m.reply('✅ Modo Sub desactivado.\n> Todos los bots del grupo pueden responder otra vez.')
  }

  const index = parseInt(action, 10)
  if (!Number.isFinite(index) || index < 1 || index > bots.length) {
    return m.reply(`[❗] Número inválido.\n\nUsa *${usedPrefix}modosub* para ver la lista\no *${usedPrefix}modosub 1* / *${usedPrefix}modosub all*`)
  }

  const selected = bots[index - 1]
  setActiveBotForGroup(m.chat, selected.number)
  await global.db.write?.()

  const tag = selected.type === 'principal' ? 'Bot Principal' : 'Sub-Bot'
  return m.reply(`✅ Ahora solo responde en este grupo:\n\n*${index}.* ${tag} — ${selected.name}\n> +${selected.number}\n\n> Los demás bots ignorarán comandos aquí.\n> Para volver a todos: *${usedPrefix}modosub all*`)
}

handler.command = ['modosub', 'modobot', 'botactivo', 'onlybot']
handler.help = ['modosub', 'modosub <n>', 'modosub all']
handler.tags = ['grupo', 'subbots']
handler.group = true
handler.admin = true

export default handler
