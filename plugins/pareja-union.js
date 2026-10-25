import { gestionarUnion, vinculoPareja, unionActiva, estadoDiarioPareja, reclamarDiarioPareja, tiempoPareja, DIA_PAREJA, prepararIdentidadesPareja } from '../lib/parejas.js'

async function responder(m, conn, text, miembros = []) {
  return conn.sendMessage(m.chat, { text, contextInfo: { ...(global.rcanal?.contextInfo || {}), mentionedJid: miembros } }, { quoted: m })
}

const etiquetas = miembros => miembros.map(j => `@${j.split('@')[0]}`).join(' y ')

async function ejecutarUnion(m, conn, participants, accion, usedPrefix = '.') {
  const tx = await global.db.adapter.claimAndUpdate(global.db.data, `union:${m.chat}:${m.key?.id || m.id || m.sender}`, 60_000,
    (datos, ahora) => gestionarUnion(datos, { jid: m.sender, chat: m.chat, accion, conn, participants }, ahora))
  const r = tx.result || {}
  const mensajes = {
    sin_pareja: '💍 No pude verificar el matrimonio en los registros de ambos. Si tu perfil ya muestra pareja, no te divorcies: puede faltar la correspondencia entre tu teléfono y tu LID de WhatsApp.',
    ausente: '💞 Ambos deben estar en este grupo para aceptar la unión de los tops.',
    desactivada: '💞 Unión global desactivada. Volverán a aparecer por separado en todos los tops.',
    sin_solicitud: 'No tienes una solicitud de unión vigente de tu pareja en este grupo.',
    solo_pareja: 'Solo tu pareja puede aceptar o rechazar la solicitud que enviaste.',
    expirada: `La solicitud expiró. Pueden volver a proponerla con ${usedPrefix}unip.`,
    invalidada: `Esta solicitud ya no es válida. Envía una nueva con ${usedPrefix}unip para autorizar la unión global.`,
    rechazada: '💞 Solicitud rechazada. Sus cuentas y puestos siguen separados.',
    ya_activa: `💞 Ya aparecen juntos en los tops globales. Usa ${usedPrefix}unip off para separarlos en todos los grupos.`,
    pendiente: 'Ya hay una solicitud de unión pendiente en este grupo. Espera un minuto.',
    activada: `💞 *¡Unión de tops activada!*\n\nPareja: ${etiquetas(r.miembros || [])}\nAparecerán juntos en topcoins y topharem *globalmente, desde cualquier grupo*.\n\n*Solo se suman los totales para el ranking: no se transfieren monedas ni personajes.*\nCualquiera puede desactivarla globalmente con ${usedPrefix}unip off.`,
    estado: `💞 Unión global de tops: *${r.activa ? 'activada' : 'desactivada'}*.\nSus saldos y colecciones siempre son personales.`,
    solicitud: `💞 *Propuesta de unión de tops*\n\n${etiquetas(r.miembros || [])}\n\n@${r.miembros?.[1]?.split('@')[0]}: ¿quieres aparecer junto a tu pareja en topcoins y topharem *globalmente, en todos los grupos*?\nResponde *si* o *no* en 1 minuto, o usa *${usedPrefix}unip si / no*.\n\n*No se mezcla el dinero ni se comparten personajes: solo se suman los totales al mostrar los tops.*`,
  }
  return responder(m, conn, mensajes[r.code] || 'No se pudo completar la solicitud. Inténtalo de nuevo.', r.miembros)
}

let handler = async (m, { conn, participants = [], args = [], command, usedPrefix = '.' }) => {
  if (!m.isGroup) return responder(m, conn, 'Estas opciones se usan en grupos.')
  try {
    await global.db.adapter.refresh?.(global.db.data)
    participants = await prepararIdentidadesPareja(m, conn, participants)
    if (command === 'dma') {
      const tx = await global.db.adapter.claimAndUpdate(global.db.data, `dma:${m.sender}`, DIA_PAREJA,
        (datos, ahora) => reclamarDiarioPareja(datos, m.sender, conn, participants, ahora))
      const r = tx.result || {}
      if (r.code === 'sin_pareja') return responder(m, conn, '💍 No pude verificar el matrimonio de ambos para entregar el premio. No se modificaron sus monedas.')
      if (r.code === 'sin_fecha') return responder(m, conn, 'Tu matrimonio no tiene fecha registrada. No se puede calcular todavía el premio; no se modificaron tus monedas.')
      if (r.code === 'espera') return responder(m, conn, `💞 El siguiente premio estará disponible en *${tiempoPareja(r.restante)}*.\nEl primero se entrega tras 24 horas casados y cualquiera reclama para ambos, una vez cada 24 horas.`)
      if (r.code !== 'premio') return responder(m, conn, 'No se pudo reclamar el premio. Inténtalo de nuevo.')
      return responder(m, conn, `💞 *Diario de matrimonio*\n\n${etiquetas(r.miembros)}\n*+${r.premio.toLocaleString()} ${global.moneda || 'coins'} para cada uno*, en su saldo personal.\nRacha: *${r.racha} días*${r.extra ? '\n🎉 Incluye 1.000 extra por completar 7 días de racha.' : ''}\n\nPróximo reclamo para ambos: dentro de 24 horas. No es necesario que los dos ejecuten el comando.`, r.miembros)
    }
    if (command === 'pareja') {
      const v = vinculoPareja(global.db.data, m.sender, conn, participants)
      if (!v) return responder(m, conn, '💍 No pude verificar el vínculo guardado de ambos. Si el perfil muestra pareja, no hace falta divorciarse: puede faltar resolver su identidad de WhatsApp.')
      const estado = estadoDiarioPareja(v)
      const total = [v.a, v.b].reduce((n, x) => n + (Number(x.user.coins) || 0) + (Number(x.user.bancoDinero) || 0), 0)
      return responder(m, conn, `💞 *Nuestra pareja*\n\n${etiquetas([v.a.key, v.b.key])}\nJuntos: ${v.desde ? Math.floor((Date.now() - v.desde) / DIA_PAREJA) + ' días' : 'sin fecha registrada'}\nTops globales: *${unionActiva(global.db.data, m.chat, v, conn, participants) ? 'juntos' : 'separados'}*\nSuma de sus saldos: *${total.toLocaleString()} ${global.moneda || 'coins'}*\n*Las cuentas y los personajes siguen separados.*\n\nRacha: ${estado.racha} días\nPremio: ${estado.sinFecha ? 'sin fecha registrada' : estado.disponible ? 'disponible' : 'en ' + tiempoPareja(estado.restante)}\n\n${usedPrefix}unip · ${usedPrefix}unip off · ${usedPrefix}dma · ${usedPrefix}comip`, [v.a.key, v.b.key])
    }
    const accion = String(args[0] || '').toLowerCase().replace('sí', 'si')
    if (!['', 'si', 'no', 'off', 'estado'].includes(accion)) return responder(m, conn, `Uso: ${usedPrefix}unip [si / no / off / estado]`)
    return await ejecutarUnion(m, conn, participants, accion, usedPrefix)
  } catch (error) {
    console.error('pareja-union:', error)
    return responder(m, conn, 'No se pudo completar la operación de pareja. Inténtalo de nuevo.')
  }
}

handler.all = async function (m, { conn, participants = [] }) {
  if (!m.isGroup || !/^(si|sí|no)$/i.test(m.text?.trim() || '')) return
  const solicitud = global.db?.data?.chats?.[m.chat]?.parejaTopSolicitud
  if (!solicitud || solicitud.expira <= Date.now()) return
  try {
    participants = await prepararIdentidadesPareja(m, conn, participants)
    const v = vinculoPareja(global.db.data, m.sender, conn, participants)
    if (!v || solicitud.target !== v.a.key) return
    m.commandExecuted = true
    await ejecutarUnion(m, conn, participants, m.text.trim().toLowerCase().replace('sí', 'si'))
  } catch (error) { console.error('pareja-union.all:', error) }
}

handler.help = ['unip [si/no/off/estado]', 'dma → Diario de matrimonio para ambos', 'pareja → Estado del matrimonio']
handler.tags = ['perfiles', 'economía']
handler.command = ['unip', 'dma', 'pareja']
handler.group = true
export default handler
