import { listInactiveInGroup } from '../lib/msg-activity.js'

const MAX_CHARS = 3500

function buildBlocks(inactive) {
  return inactive.map((row, i) => {
    const pos = i + 1
    return [
      `*#${pos}* @${String(row.jid).split('@')[0]}`,
      `> 𓂃 ࣪ ִֶָ☾.  ${row.name}`,
      `> 𓂃 ࣪ ִֶָ☾.  Mensajes en este grupo: *0*`,
    ].join('\n')
  })
}

function chunkBlocks(blocks, headerLines, footerLines) {
  const header = headerLines.join('\n')
  const footer = footerLines.filter(Boolean).join('\n')
  const chunks = []
  let current = []
  let size = header.length + footer.length + 4

  for (const block of blocks) {
    const add = block.length + 2
    if (current.length && size + add > MAX_CHARS) {
      chunks.push([header, '', ...current, '', footer].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n'))
      current = []
      size = header.length + footer.length + 4
    }
    current.push(block)
    size += add
  }

  if (current.length) {
    chunks.push([header, '', ...current, '', footer].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n'))
  }
  return chunks
}

let handler = async (m, { conn, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Este comando solo funciona en grupos.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }

  try {
    let participants = []
    try {
      const meta = await conn.groupMetadata(m.chat)
      participants = meta?.participants || []
    } catch {
      participants = conn.chats?.[m.chat]?.metadata?.participants || []
    }

    const inactive = listInactiveInGroup(conn, m.chat, participants)
    if (!inactive.length) {
      return conn.sendMessage(m.chat, {
        text: `👻 *TOP INACTIVOS*\n\n> No hay miembros sin mensajes registrados en este grupo.\n> (El conteo empieza desde que el bot registra actividad)`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const mentions = inactive.map(x => x.jid)
    const blocks = buildBlocks(inactive)
    const header = [
      `👻 *TOP INACTIVOS*`,
      `> Miembros sin mensajes en *este grupo*`,
      `> Total: *${inactive.length}*`,
    ]
    const footer = [
      `> Perfil: *${usedPrefix || '.'}perfil @user*`,
    ]

    const parts = chunkBlocks(blocks, header, footer)

    for (let i = 0; i < parts.length; i++) {
      const text = parts.length > 1
        ? `${parts[i]}\n> Parte *${i + 1}/${parts.length}*`
        : parts[i]

      await conn.sendMessage(m.chat, {
        text,
        mentions,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: i === 0 ? m : undefined })
    }
  } catch (e) {
    console.error('topinactivos:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo generar el top de inactivos.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['topinactivos']
handler.tags = ['grupo', 'rpg']
handler.command = ['topinactivos', 'inactivos', 'topinactive', 'sinmensajes']
handler.group = true

export default handler
