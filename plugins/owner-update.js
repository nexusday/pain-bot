import { execSync } from 'child_process'

let handler = async (m, { conn, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  m.react = async emoji => {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  }

  await m.react('🕓')

  if (conn.user.jid == conn.user.jid) {
    let stdout = execSync('git pull' + (m.fromMe && text ? ' ' + text : ''))
    await conn.reply(m.chat, stdout.toString(), m, rcanal)
    await m.react('✅')
  }
}

handler.help = ['update']
handler.tags = ['owner']
handler.command = ['update', 'actualizar', 'fix', 'fixed']
handler.rowner = true

export default handler
