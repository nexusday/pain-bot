import { abrirSorteoActual, anunciarApertura, comprarBoletos, obtenerSorteo, marcarInteresLoteria, obtenerTzLoteria, establecerTzLoteria, textoTzLoteria, enHorarioNocturno, MAX_BOLETOS_POR_USUARIO, MIN_COMPRADORES, MAX_POZO, horaCierreTexto } from '../lib/loteria.js'

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isOwner }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const sub = String(args[0] || '').toLowerCase().trim()
    if (sub === 'tz' || sub === 'zona' || sub === 'hora') {
      if (!argZona(args)) {
        return conn.sendMessage(m.chat, {
          text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *zona horaria de lotería*
╰─ ✧  ✩
┊ actual  ·  \`${textoTzLoteria(m.chat)}\`
┊ noche sin pozos  ·  \`00:00 a 04:59\` (de esa zona)
┊ cambiar (admin)  ·  \`${usedPrefix + command} tz -5\`
┊ ejemplos  ·  \`Perú/Col -5\` · \`México -6\` · \`Argentina -3\` · \`España +1\`
╰─────────`.trim(),
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
      if (!isAdmin && !isOwner) {
        return conn.sendMessage(m.chat, {
          text: '[❗] Solo admins pueden cambiar la zona horaria.',
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
      try {
        const min = parsearTz(argZona(args))
        establecerTzLoteria(m.chat, min)
        await global.db.write().catch(() => {})
        return conn.sendMessage(m.chat, {
          text: `Zona horaria de lotería: *${textoTzLoteria(m.chat)}*\n> Los pozos pausan de noche en esa hora.`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      } catch (e) {
        return conn.sendMessage(m.chat, {
          text: `[❗] ${e?.message || 'Zona inválida.'}\n> Ejemplo: *${usedPrefix + command} tz -5*`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
    }

    const { sorteo } = await abrirSorteoActual(m.chat, conn)
    marcarInteresLoteria(m.chat)
    if (!sorteo) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No se pudo abrir el pozo. Inténtalo de nuevo.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    await anunciarApertura(conn, m.chat, sorteo)

    const arg = String(args[0] || '').trim().toLowerCase()
    if (!arg) {
      const entradas = Object.entries(sorteo.boletos || {}).filter(([, n]) => Number(n) > 0)
      const totalBoletos = entradas.reduce((s, [, n]) => s + Number(n), 0)
      const mios = Number(sorteo.boletos?.[m.sender]) || 0
      const mins = Math.max(0, Math.ceil((Number(sorteo.terminaEn) - Date.now()) / 60000))
      const pot = (Number(sorteo.premioAnunciado) || 0) + (Number(sorteo.pot) || 0)
      return conn.sendMessage(m.chat, {
        text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *lotería (${sorteo.nombreTier})*
╰─ ✧  ✩
┊ pozo actual  ·  \`${pot.toLocaleString()} ${global.moneda || 'USD'}\` (máx. \`${MAX_POZO.toLocaleString()}\`)
┊ boleto  ·  \`${Number(sorteo.precioBoleto).toLocaleString()} ${global.moneda || 'USD'}\`
┊ tus boletos  ·  \`${mios}/${MAX_BOLETOS_POR_USUARIO}\`
┊ participantes  ·  \`${entradas.length}/${MIN_COMPRADORES}\` mínimo
┊ cierra  ·  \`${horaCierreTexto(sorteo.terminaEn, obtenerTzLoteria(m.chat))}\` (en ~${mins} min)
┊ compra con  ·  \`${usedPrefix + command} <cantidad>\`
╰─────────`.trim(),
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const cantidad = Math.floor(Number(arg))
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso: *${usedPrefix + command} <cantidad>*\n> Ejemplo: *${usedPrefix + command} 3*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const res = await comprarBoletos(m.chat, m.sender, cantidad)
    if (!res?.ok) {
      return conn.sendMessage(m.chat, {
        text: `[❗] ${res?.error || 'No se pudo comprar.'}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    const fresco = obtenerSorteo(m.chat)
    const pot = fresco
      ? (Number(fresco.premioAnunciado) || 0) + (Number(fresco.pot) || 0)
      : null
    return conn.sendMessage(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *boleto(s) comprados*
╰─ ✧  ✩
┊ cantidad  ·  \`${cantidad}\`
┊ costo  ·  \`${Number(res.costo).toLocaleString()} ${global.moneda || 'USD'}\`
┊ tus boletos  ·  \`${res.boletos}/${MAX_BOLETOS_POR_USUARIO}\`${pot !== null ? `\n┊ pozo actual  ·  \`${pot.toLocaleString()} ${global.moneda || 'USD'}\`` : ''}
╰─────────`.trim(),
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en loteria:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error con la lotería.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['loteria [cantidad]\n→ Ver el pozo o comprar boletos', 'loteria tz [-5]\n→ Ver o fijar la zona horaria del grupo (admin)']
handler.tags = ['juegos', 'economía']
handler.command = ['loteria', 'lotería', 'lotery', 'pozo']
handler.group = true

export default handler

function argZona(args) {
  const v = String(args[1] || '').trim()
  return v ? v : null
}

function parsearTz(crudo) {
  const m = String(crudo || '').trim().match(/^([+-]?)(\d{1,2})(?::([03]0))?$/)
  if (!m) throw new Error('Zona inválida (usa horas de -12 a +14, ej. -5, -6, +1).')
  const mins = Number(m[2]) * 60 + Number(m[3] || 0)
  const v = m[1] === '+' ? mins : -mins
  if (v < -720 || v > 840) throw new Error('Zona inválida (usa horas de -12 a +14, ej. -5, -6, +1).')
  return v
}
