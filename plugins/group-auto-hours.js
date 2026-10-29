import { activarHorario, crearHorario, desactivarHorario, invalidarEstadoHorario, revisarHorario, resumenHorario, siguienteCambio, guardarHorario } from '../lib/group-auto-hours.js'

const ayuda = (p) => `Uso de ${p}rab:
• ${p}rab Peru|8:00 am|10:00 pm
• ${p}rab on — activar el horario guardado
• ${p}rab off — desactivar sin borrar la configuración
• ${p}rab — ver el estado actual

También puedes usar gm/gmt/utc o una zona IANA, por ejemplo: America/Lima.`

function responder(conn, m, texto) {
  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m })
}

function ayudaBonita(p) {
  return `🌴 𝗛𝗼𝗿𝗮𝗿𝗶𝗼 𝗮𝘂𝘁𝗼𝗺𝗮́𝘁𝗶𝗰𝗼 𝗱𝗲𝗹 𝗴𝗿𝘂𝗽𝗼\n\n${ayuda(p)}`
}

const handler = async (m, { conn, text, usedPrefix }) => {
  if (!m.isGroup) return responder(conn, m, '❗ Este comando solo funciona en grupos.')
  const entrada = String(text || '').trim()
  const horarioActual = global.db?.data?.chats?.[m.chat]?.rab

  if (!entrada) {
    if (!horarioActual) return responder(conn, m, ayudaBonita(usedPrefix))
    const cambio = siguienteCambio(horarioActual)
    let estadoReal = 'desconocido'
    try {
      const meta = await conn.groupMetadata(m.chat)
      estadoReal = meta?.announce ? 'cerrado' : 'abierto'
    } catch {}
    return responder(conn, m, `🌴 𝗛𝗼𝗿𝗮𝗿𝗶𝗼 𝗥𝗔𝗕\n\n> *Estado:* ${horarioActual.enabled ? '✅ Activo' : '⏸️ Inactivo'}\n> *Grupo ahora:* ${estadoReal}\n> *Zona:* ${horarioActual.timezoneLabel || horarioActual.timezone}\n> *Apertura:* ${horarioActual.open}\n> *Cierre:* ${horarioActual.close}\n> *Próximo ${cambio.tipo}:* ${cambio.hora}`)
  }

  const opcion = entrada.toLowerCase()
  if (opcion === 'off') {
    if (!horarioActual) return responder(conn, m, '❗ No hay un horario guardado para este grupo.')
    desactivarHorario(m.chat)
    invalidarEstadoHorario(conn, m.chat)
    return responder(conn, m, `🌴 𝗛𝗼𝗿𝗮𝗿𝗶𝗼 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼\n\n> La configuración se conservó.\n> *Horario:* ${resumenHorario(horarioActual)}\n> Usa *${usedPrefix}rab on* para reactivarlo.`)
  }

  if (opcion === 'on') {
    if (!horarioActual) return responder(conn, m, `❗ No hay configuración guardada.\n\n${ayudaBonita(usedPrefix)}`)
    activarHorario(m.chat)
    invalidarEstadoHorario(conn, m.chat)
    await revisarHorario(conn, m.chat)
    return responder(conn, m, `🌴 𝗛𝗼𝗿𝗮𝗿𝗶𝗼 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼\n\n> *Zona:* ${horarioActual.timezoneLabel || horarioActual.timezone}\n> *Abre:* ${horarioActual.open}\n> *Cierra:* ${horarioActual.close}`)
  }

  const partes = entrada.split('|').map(parte => parte.trim())
  if (partes.length !== 3 || partes.some(Boolean) === false) return responder(conn, m, ayudaBonita(usedPrefix))
  try {
    const horario = crearHorario(partes[0], partes[1], partes[2])
    guardarHorario(m.chat, horario)
    invalidarEstadoHorario(conn, m.chat)
    await revisarHorario(conn, m.chat)
    return responder(conn, m, `🌴 𝗛𝗼𝗿𝗮𝗿𝗶𝗼 𝗴𝘂𝗮𝗿𝗱𝗮𝗱𝗼 𝘆 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼\n\n> *Zona:* ${horario.timezoneLabel || horario.timezone}\n> *El grupo abre:* ${horario.open}\n> *El grupo cierra:* ${horario.close}\n\n> Puedes usar *${usedPrefix}rab off* para desactivarlo sin borrar la configuración.`)
  } catch (error) {
    return responder(conn, m, `❌ ${error.message}\n\n${ayudaBonita(usedPrefix)}`)
  }
}

handler.command = ['rab', 'horariogrupo', 'autogrupo']
handler.tags = ['grupo', 'admins']
handler.help = ['rab PAIS|hora apertura|hora cierre', 'rab on/off']
handler.group = true
handler.admin = true
handler.botAdmin = true
handler.all = async function (m, { conn }) {
  if (m.isGroup && !m.fromMe) await revisarHorario(conn, m.chat)
}

export default handler
