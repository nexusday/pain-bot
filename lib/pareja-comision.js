/**
 * Comisión de pareja: si estás casado (/marry) puedes compartir un % de lo
 * que ganas en juegos con tu pareja (/comi 10). Máximo 50%.
 * Se guarda en DB: users[jid].comisionPareja = 0..50
 */

export const MAX_COMISION = 50

// Comandos que mueven dinero propio (banco, préstamos, transferencias):
// no son "ganancias", así que nunca generan comisión.
export const COMANDOS_SIN_COMISION = new Set([
  'banco', 'bank',
  'deposit', 'depositar',
  'withdraw', 'retirar', 'retiro',
  'change', 'cambiarbanco',
  'unirsebank', 'unirse',
  'prestamo', 'préstamo', 'loan',
  'pagar', 'pay', 'pagarprestamo',
  'transf', 'transfer', 'transferir', 'dar',
])

function digitos(v = '') {
  return String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function asegurarUsuario(jid) {
  if (!global.db?.data?.users) return null
  if (!global.db.data.users[jid]) {
    global.db.data.users[jid] = {
      registered: true,
      name: 'Usuario',
      regTime: Date.now(),
      age: -1,
      level: 1,
      coins: 0,
      exp: 0,
      commandCount: 0,
      stickerCount: 0,
      msgCount: 0,
      msgByChat: {},
      genre: 'No establecido',
      birth: 'No registrado',
      desc: 'Sin descripción',
      favourite: 'No establecido',
      partner: '',
      banned: false,
      prem: false,
      rpgV2: true,
    }
  }
  return global.db.data.users[jid]
}

/** Pareja guardada (JID tal cual lo guardó /marry). */
export function obtenerParejaDe(jid) {
  const directo = global.db?.data?.users?.[jid]?.partner
  if (directo) return directo
  // Respaldo por si el remitente llega con otra identidad (LID vs PN):
  // marry sincroniza todas las llaves, pero ante la duda se busca por dígitos.
  const d = digitos(jid)
  if (d.length >= 8 && global.db?.data?.users) {
    for (const [key, u] of Object.entries(global.db.data.users)) {
      if (digitos(key) === d && u?.partner) return u.partner
    }
  }
  return ''
}

/** % de comisión configurado (0 si no hay). */
export function obtenerComision(jid) {
  const pct = Math.floor(Number(global.db?.data?.users?.[jid]?.comisionPareja) || 0)
  if (!Number.isFinite(pct) || pct <= 0) return 0
  return Math.min(pct, MAX_COMISION)
}

export function establecerComision(jid, pct) {
  const usuario = asegurarUsuario(jid)
  if (!usuario) throw new Error('Sin base de datos.')
  const n = Math.floor(Number(pct))
  if (!Number.isFinite(n) || n < 0 || n > MAX_COMISION) {
    throw new Error(`El porcentaje debe ser un número de 0 a ${MAX_COMISION}.`)
  }
  usuario.comisionPareja = n
  return n
}

/**
 * Mueve el % configurado de una ganancia al partner.
 * Retorna { parte, pct, partner } o null si no aplica.
 */
export async function aplicarComisionPareja(ganadorJid, monto, conn, chat, m = null) {
  try {
    const ganado = Math.floor(Number(monto) || 0)
    if (ganado <= 0 || !ganadorJid || !conn || !chat) return null
    const pct = obtenerComision(ganadorJid)
    if (!pct) return null
    const pareja = obtenerParejaDe(ganadorJid)
    if (!pareja || digitos(pareja) === digitos(ganadorJid)) return null

    const parte = Math.floor((ganado * pct) / 100)
    if (parte < 1) return null

    const ganador = asegurarUsuario(ganadorJid)
    const socio = asegurarUsuario(pareja)
    if (!ganador || !socio) return null
    ganador.coins = Math.max(0, (Number(ganador.coins) || 0) - parte)
    socio.coins = (Number(socio.coins) || 0) + parte

    await conn.sendMessage(chat, {
      text: `💞 *Comisión de pareja (${pct}%)*\n\n> @${String(ganadorJid).split('@')[0]} comparte \`+${parte.toLocaleString()} ${global.moneda || 'USD'}\` con @${String(pareja).split('@')[0]}`,
      contextInfo: {
        ...(global.rcanal?.contextInfo || {}),
        mentionedJid: [ganadorJid, pareja],
      },
    }, m ? { quoted: m } : undefined).catch(() => {})
    return { parte, pct, partner: pareja }
  } catch (error) {
    console.error('[comi] Error aplicando comisión:', error?.message || error)
    return null
  }
}

export {
  obtenerParejaDe as getPartnerOf,
  obtenerComision as getCommission,
  establecerComision as setCommission,
  aplicarComisionPareja as applyPartnerCommission,
}
