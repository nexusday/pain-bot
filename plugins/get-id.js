import { candidatosJidRemitente } from '../lib/group-participant.js'

let handler = async (m, { conn }) => {
  const quien = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : null
  const ids = quien
    ? candidatosJidRemitente(null, conn, [quien])
    : candidatosJidRemitente(m, conn)

  const lids = [...new Set(
    ids
      .filter(j => String(j).endsWith('@lid') || String(j).endsWith('@hosted.lid'))
      .map(j => String(j).split('@')[0].split(':')[0])
  )]
  const numeros = [...new Set(
    ids
      .filter(j => String(j).endsWith('@s.whatsapp.net') || String(j).endsWith('@c.us'))
      .map(j => String(j).split('@')[0].split(':')[0])
  )]

  const usuario = global.db.data.users[quien || m.sender]
  const lineas = [
    `ᬊ *Nombre:* ${usuario?.name || m.pushName || 'Sin Registrar'}`,
    lids.length ? `ᬊ *LID:* ${lids.join(', ')}` : null,
    numeros.length ? `ᬊ *Número:* ${numeros.join(', ')}` : null,
    !lids.length && !numeros.length ? `ᬊ *ID:* ${quien || m.sender}` : null,
    '',
    '_Para ownerLid usa el *LID*. Si no aparece, escribe al bot en privado y vuelve a usar /id._'
  ].filter(v => v !== null)

  await conn.sendMessage(m.chat, {
    text: lineas.join('\n'),
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
}

handler.help = ['#id • #getid\n→ Obtener LID / número del usuario']
handler.tags = ['info']
handler.command = ['id', 'getid', 'detid']

export default handler
