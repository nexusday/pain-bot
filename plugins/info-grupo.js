const SEP = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈'
const MARCA = '𓂃 ࣪ ִֶָ☾.'
const tip = (v) => `\`${String(v ?? '').replace(/`/g, "'")}\``

function digitosDe(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function etiquetaMention(jid) {
  const n = digitosDe(jid)
  return n ? `@${n}` : '—'
}

function cortar(texto, max = 420) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  if (limpio.length <= max) return limpio
  return `${limpio.slice(0, max).trim()}…`
}

let handler = async (m, { conn }) => {
  if (!m.chat.endsWith('@g.us')) {
    return conn.sendMessage(m.chat, {
      text: `
ㅤ
${MARCA}  *grupo*
_solo en grupos_
ㅤ`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const metadata = await conn.groupMetadata(m.chat)
    const {
      subject: name,
      owner,
      creation,
      desc,
      participants
    } = metadata

    const miembros = participants || []
    const admins = miembros.filter(p => p.admin === 'admin' || p.admin === 'superadmin')
    const idsAdmin = admins.map(p => p.id).filter(Boolean)

    const numerosOwner = new Set()
    for (const entrada of [...(global.owner || []), ...(global.ownerLid || [])]) {
      const numero = Array.isArray(entrada) ? entrada[0] : entrada
      const digitos = digitosDe(numero)
      if (digitos) numerosOwner.add(digitos)
    }

    const ownersEnGrupo = miembros.filter(p => {
      const ids = [p.id, p.jid, p.phoneNumber].map(digitosDe).filter(Boolean)
      return ids.some(id => numerosOwner.has(id))
    })

    const fecha = creation
      ? new Date(Number(creation) > 1e12 ? Number(creation) : Number(creation) * 1000).toLocaleString('es-ES')
      : '—'

    const descripcion = cortar(desc) || 'sin descripción'
    const menciones = [...new Set([
      ...(owner ? [owner] : []),
      ...idsAdmin,
      ...ownersEnGrupo.map(p => p.id)
    ].filter(Boolean))]

    const bloqueAdmins = idsAdmin.length
      ? idsAdmin.map(id => etiquetaMention(id)).join('\n')
      : tip('ninguno')

    const bloqueOwners = ownersEnGrupo.length
      ? ownersEnGrupo.map(p => etiquetaMention(p.id)).join('\n')
      : tip('no están en este grupo')

    const textoInfo = `
ㅤ
${MARCA}  *grupo*
_${name || 'sin nombre'}_

${SEP}
*datos*
miembros  ·  ${tip(miembros.length)}
admins  ·  ${tip(idsAdmin.length)}
creado  ·  ${tip(fecha)}

${SEP}
*creador*
${owner ? etiquetaMention(owner) : tip('desconocido')}

${SEP}
*admins*
${bloqueAdmins}

${SEP}
*owners del bot aquí*
${bloqueOwners}

${SEP}
*descripción*
${descripcion}
ㅤ`.trim()

    const contexto = {
      mentionedJid: menciones,
      ...rcanal.contextInfo
    }

    try {
      const groupPic = await conn.profilePictureUrl(m.chat, 'image')
      if (groupPic) {
        await conn.sendMessage(m.chat, {
          image: { url: groupPic },
          caption: textoInfo,
          contextInfo: contexto
        }, { quoted: m })
        return
      }
    } catch {}

    await conn.sendMessage(m.chat, {
      text: textoInfo,
      contextInfo: contexto
    }, { quoted: m })
  } catch (error) {
    console.error('Error en infogrupo:', error)
    await conn.sendMessage(m.chat, {
      text: `
ㅤ
${MARCA}  *grupo*
_no se pudo leer_

${SEP}
${tip(error?.message || 'error desconocido')}
ㅤ`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['infogrupo → información del grupo']
handler.tags = ['group', 'info']
handler.command = ['infogrupo', 'infogp', 'groupinfo']

export default handler
