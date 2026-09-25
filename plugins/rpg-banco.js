
const bancos = {
  'konoha': {
    nombre: 'BANK KONOHA',
    emoji: 'K',
    descripcion: 'Banco tradicional con intereses moderados'
  },
  'akatsuki': {
    nombre: 'BANK AKATSUKI',
    emoji: 'A',
    descripcion: 'Banco misterioso con altos riesgos y recompensas'
  },
  'boys': {
    nombre: 'BANK BOYS',
    emoji: 'B',
    descripcion: 'Banco juvenil con servicios modernos'
  }
}

const costoCambioBanco = 350


global.bancos = bancos

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    let usuario = global.db.data.users[m.sender]
    if (!usuario) {
      global.db.data.users[m.sender] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      usuario = global.db.data.users[m.sender]
    }

    
    if (!usuario.banco) usuario.banco = null
    if (!usuario.bancoDinero) usuario.bancoDinero = 0

    
    switch (command) {
      case 'banco':
      case 'bank':
        return mostrarInfoBancoUsuario(usuario, conn, m)

      case 'deposit':
        return depositarDinero(usuario, args[0], conn, m, usedPrefix)

      case 'withdraw':
        return retirarDinero(usuario, args[0], conn, m, usedPrefix)

      case 'change':
        return cambiarBanco(usuario, args[0], conn, m, usedPrefix)

      case 'unirsebank':
        return unirseBanco(usuario, args[0], conn, m, usedPrefix)

      default:
        return mostrarInfoBancoUsuario(usuario, conn, m)
    }

  } catch (error) {
    console.error('Error en banco:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error en el sistema bancario.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

function mostrarInfoBancoUsuario(usuario, conn, m) {
  if (!usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa #unirsebank <banco>\n> *Bancos:* konoha, akatsuki, boys`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[usuario.banco]
  const totalDinero = usuario.coins + usuario.bancoDinero

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${banco.nombre}*
╰─ ✧  ✩
┊ disponible  ·  \`${usuario.coins} ${global.moneda}\`
┊ en banco  ·  \`${usuario.bancoDinero} ${global.moneda}\`
┊ total  ·  \`${totalDinero} ${global.moneda}\`
┊ deposit  ·  \`<cantidad / all>\`
┊ withdraw  ·  \`<cantidad / all>\`
┊ change  ·  \`<banco>\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function unirseBanco(usuario, bancoElegido, conn, m, usedPrefix) {
  if (usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ya perteneces a ${bancos[usuario.banco].nombre}.\nUsa .change <banco> para cambiar.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!bancoElegido || !bancos[bancoElegido]) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Banco no valido. Elige: konoha, akatsuki, o boys`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.banco = bancoElegido
  const banco = bancos[bancoElegido]

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${banco.nombre}*
╰─ ✧  ✩
┊ ${banco.descripcion}
┊ en banco  ·  \`${usuario.bancoDinero} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function cambiarBanco(usuario, bancoElegido, conn, m, usedPrefix) {
  if (!usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco.\n> Usa .unirsebank <banco> para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!bancoElegido || !bancos[bancoElegido]) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Banco no valido. Elige: konoha, akatsuki, o boys`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.banco === bancoElegido) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ya perteneces a ${bancos[usuario.banco].nombre}.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.coins < costoCambioBanco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cambio de banco cuesta ${costoCambioBanco} ${global.moneda}.\n> *Tienes:* ${usuario.coins} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const bancoAnterior = bancos[usuario.banco]
  usuario.coins -= costoCambioBanco
  usuario.banco = bancoElegido
  const bancoNuevo = bancos[bancoElegido]

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${bancoNuevo.nombre}*
╰─ ✧  ✩
┊ antes  ·  \`${bancoAnterior.nombre}\`
┊ costo  ·  \`${costoCambioBanco} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function depositarDinero(usuario, cantidad, conn, m, usedPrefix) {
  if (!usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa .unirsebank <banco> para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0

  if (cantidad === 'all' || cantidad === 'todo') {
    
    if (usuario.coins === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Tu dinero ya esta completamente en el banco.\n> Dinero en banco: ${usuario.bancoDinero} ${global.moneda}\n> Usa .withdraw <cantidad> para retirar.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = usuario.coins
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cantidad invalida\n> Usa: .deposit <cantidad> o .deposit all`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.coins < monto) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No tienes suficientes ${global.moneda}.\n> Tienes: ${usuario.coins} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.coins -= monto
  usuario.bancoDinero += monto
  const banco = bancos[usuario.banco]

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${banco.nombre}*
╰─ ✧  ✩
┊ depositado  ·  \`${monto} ${global.moneda}\`
┊ en banco  ·  \`${usuario.bancoDinero} ${global.moneda}\`
┊ disponible  ·  \`${usuario.coins} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function retirarDinero(usuario, cantidad, conn, m, usedPrefix) {
  if (!usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa .unirsebank <banco> para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0

  if (cantidad === 'all' || cantidad === 'todo') {
    
    if (usuario.bancoDinero === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No tienes dinero en el banco\n> Dinero disponible: ${usuario.coins} ${global.moneda}\n> Usa .deposit <cantidad> para guardar dinero.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = usuario.bancoDinero
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cantidad invalida\n> Usa: .withdraw <cantidad> o .withdraw all`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.bancoDinero < monto) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No tienes suficientes ${global.moneda} en el banco.\n> En banco: ${usuario.bancoDinero} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.coins += monto
  usuario.bancoDinero -= monto
  const banco = bancos[usuario.banco]

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${banco.nombre}*
╰─ ✧  ✩
┊ retirado  ·  \`${monto} ${global.moneda}\`
┊ en banco  ·  \`${usuario.bancoDinero} ${global.moneda}\`
┊ disponible  ·  \`${usuario.coins} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function verSaldoBanco(usuario, conn, m) {
  if (!usuario.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningún banco.\n> Usa *${usedPrefix}banco unirse <banco>* para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[usuario.banco]
  const totalDinero = usuario.coins + usuario.bancoDinero

  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${banco.nombre}*
╰─ ✧  ✩
┊ disponible  ·  \`${usuario.coins} ${global.moneda}\`
┊ en banco  ·  \`${usuario.bancoDinero} ${global.moneda}\`
┊ total  ·  \`${totalDinero} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function mostrarInfoBanco(usuario, conn, m) {
  let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *bancos*
╰─ ✧  ✩
┊ konoha  ·  \`tradicional\`
┊ akatsuki  ·  \`riesgo alto\`
┊ boys  ·  \`moderno\`
┊ cambio  ·  \`${costoCambioBanco} ${global.moneda}\`
╰─────────`.trim()

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.help = ['banco', 'bank']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['banco', 'bank', 'deposit', 'withdraw', 'change', 'unirsebank']

export default handler
