/**
 * Modo de los antis:
 *   del | on  → solo borra el mensaje
 *   all       → borra el mensaje y expulsa
 *   off       → apagado
 *
 * Un `true` viejo (el on de antes) no cambia de golpe:
 * legacy 'all' en los que ya expulsaban, 'del' en los que solo borraban.
 */

export function modoAnti(valor, legacy = 'del') {
  if (valor === false || valor == null || valor === 'off' || valor === 0) return 'off'
  if (valor === 'all' || valor === 'kick') return 'all'
  if (valor === 'del' || valor === 'on' || valor === 'delete') return 'del'
  if (valor === true) return legacy === 'all' ? 'all' : 'del'

  if (typeof valor === 'object') {
    if (valor.enabled === false) return 'off'
    const marca = String(valor.mode || valor.action || '').toLowerCase()
    if (marca === 'all' || marca === 'kick') return 'all'
    if (marca === 'del' || marca === 'on' || marca === 'delete') return 'del'
    if (valor.enabled === true) return legacy === 'all' ? 'all' : 'del'
  }

  return 'off'
}

export function antiActivo(valor, legacy = 'del') {
  return modoAnti(valor, legacy) !== 'off'
}

export async function expulsarParticipante(conn, chat, sender, etiqueta = 'anti') {
  if (!conn?.groupParticipantsUpdate || !chat || !sender) return false
  try {
    await conn.groupParticipantsUpdate(chat, [sender], 'remove')
    return true
  } catch (e) {
    console.error(`[${etiqueta}] no se pudo expulsar:`, e?.message || e)
    return false
  }
}

function contexto(m) {
  return {
    ...(global.rcanal?.contextInfo || {}),
    mentionedJid: m?.sender ? [m.sender] : [],
  }
}

export async function configurarAntiSimple(m, conn, {
  args,
  usedPrefix,
  command,
  dbKey,
  nombre,
  legacy = 'del',
} = {}) {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    if (!global.db.data) global.db.data = {}
    if (!global.db.data[dbKey] || typeof global.db.data[dbKey] !== 'object') {
      global.db.data[dbKey] = {}
    }

    const accion = String(args?.[0] || '').toLowerCase().trim()
    const mapa = global.db.data[dbKey]
    const quien = `@${String(m.sender || '').split('@')[0]}`
    const aviso = (texto) => conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: contexto(m),
    }, { quoted: m })

    if (accion === 'off') {
      mapa[m.chat] = false
      return aviso(`ִֶָ☾. *${nombre} desactivado correctamente*\n> Por: ${quien}`)
    }

    if (accion === 'on' || accion === 'del') {
      mapa[m.chat] = 'del'
      return aviso(`ִֶָ☾. *${nombre} activado*\n> Solo elimina el mensaje\n> Por: ${quien}`)
    }

    if (accion === 'all') {
      mapa[m.chat] = 'all'
      return aviso(`ִֶָ☾. *${nombre} activado*\n> Elimina el mensaje y al usuario\n> Por: ${quien}`)
    }

    if (accion === 'ver' || accion === 'status' || accion === 'estado') {
      const modo = modoAnti(mapa[m.chat], legacy)
      const estado = modo === 'off'
        ? 'OFF'
        : modo === 'all'
          ? 'ALL (borra el mensaje y expulsa)'
          : 'DEL (solo borra el mensaje)'
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *${nombre}*\n> Estado: ${estado}`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, {
      text:
        `[❗] Debes poner una acción.\n\n` +
        `> *Ejemplo:* ${usedPrefix}${command} del\n` +
        `> *Ejemplo:* ${usedPrefix}${command} on\n` +
        `> *Ejemplo:* ${usedPrefix}${command} all\n` +
        `> *Ejemplo:* ${usedPrefix}${command} off\n\n` +
        `> *del* y *on* solo eliminan el mensaje\n` +
        `> *all* elimina el mensaje y al usuario`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } catch (error) {
    console.error(`Error en ${dbKey}:`, error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el anti.',
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}
