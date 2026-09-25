import { puedeUsarMod, esBotPrincipal, esOwnerConfig, numeroBotDe } from '../lib/staff.js'
import { recolectarCandidatosObjetivoGrupo } from '../lib/resolve-group-target.js'
import { jidsSeSolapan, candidatosJidRemitente } from '../lib/group-participant.js'
import { agregarBlackn, quitarBlackn, listarBlackn } from '../lib/blackn.js'

const ACCIONES_VER = new Set(['ver', 'lista', 'list', 'view'])
const ACCIONES_QUITAR = new Set(['del', 'delete', 'quitar', 'sacar', 'off', 'remove'])

function crearIdsOwner(numero) {
  const digitos = String(numero || '').replace(/\D/g, '')
  if (!digitos) return []
  return [
    `${digitos}@s.whatsapp.net`,
    `${digitos}@lid`,
    `${digitos}@hosted.lid`
  ]
}

function esProtegido(ids, conn) {
  const protegidos = [
    ...crearIdsOwner(numeroBotDe(conn)),
    ...crearIdsOwner(numeroBotDe(global.conn))
  ]
  for (const entrada of global.owner || []) {
    protegidos.push(...crearIdsOwner(Array.isArray(entrada) ? entrada[0] : entrada))
  }
  for (const entrada of global.ownerLid || []) {
    protegidos.push(...crearIdsOwner(Array.isArray(entrada) ? entrada[0] : entrada))
  }
  return jidsSeSolapan(ids, protegidos)
}

function etiqueta(entrada) {
  const jid = (entrada?.ids || []).find(id => String(id).endsWith('@s.whatsapp.net')) || entrada?.ids?.[0] || ''
  const visible = String(jid).split('@')[0]
  return `${entrada?.name || 'contacto'} · \`${visible}\``
}

let handler = async (m, { conn, args, usedPrefix, command, participants }) => {
  if (!puedeUsarMod(m, conn) && !esOwnerConfig(m, conn)) {
    return conn.sendMessage(m.chat, {
      text: esBotPrincipal(conn)
        ? '[❗] Solo el *owner principal* puede usar esto.'
        : '[❗] Solo el *owner de este subbot* o el *owner principal* pueden usar esto.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const accion = (args[0] || '').toLowerCase()

  if (!args.length && !m.quoted && !m.mentionedJid?.length) {
    return conn.sendMessage(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *blackn*
╰─ ✧  ✩
┊ el bot no responde a ese contacto
┊ \`${usedPrefix + command} @usuario\`
┊ \`${usedPrefix + command}\`  ·  responder
┊ \`${usedPrefix + command} 51900000000\`
┊ \`${usedPrefix + command} del @usuario\`
┊ \`${usedPrefix + command} ver\`
╰─────────`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (ACCIONES_VER.has(accion) && !m.quoted && !m.mentionedJid?.length) {
    const lista = listarBlackn(conn)
    const cuerpo = lista.length
      ? lista.map((item, i) => `┊ *${i + 1}.* ${etiqueta(item)}`).join('\n')
      : '┊ `vacía`'
    return conn.sendMessage(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *lista*
╰─ ✧  ✩
${cuerpo}
╰─────────`.trim(),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const argsObjetivo = ACCIONES_QUITAR.has(accion) ? args.slice(1) : args
  const candidatos = await recolectarCandidatosObjetivoGrupo(
    m,
    argsObjetivo,
    conn,
    participants || [],
    {}
  )

  if (!candidatos.length) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Indica a quién.\n> Responde, menciona o pon número / lid.\n> \`${usedPrefix + command} ver\` para la lista.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (jidsSeSolapan(candidatos, candidatosJidRemitente(m, conn))) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes ponerte a ti mismo.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (esProtegido(candidatos, conn)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No se puede bloquear a un owner del bot.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (ACCIONES_QUITAR.has(accion)) {
    const quitado = quitarBlackn(conn, candidatos)
    return conn.sendMessage(m.chat, {
      text: quitado.ok
        ? `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *sacado*
╰─ ✧  ✩
┊ el bot vuelve a responderle
╰─────────`.trim()
        : '[❗] Esa persona no está en la lista.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const nombre = m.quoted?.pushName || m.quoted?.name || 'contacto'
  const resultado = agregarBlackn(conn, {
    name: nombre,
    ids: candidatos,
    by: m.sender
  })

  return conn.sendMessage(m.chat, {
    text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${resultado.ya ? 'ya estaba' : 'ignorado'}*
╰─ ✧  ✩
┊ este bot no le hará caso
┊ \`${usedPrefix + command} del\`  ·  responder o mencionar
╰─────────`.trim(),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.help = ['blackn @usuario / responder / numero / lid · del · ver']
handler.tags = ['owner']
handler.command = ['blackn', 'blacknum', 'ignorar']
handler.group = false

export default handler
