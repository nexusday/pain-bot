
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

    let user = global.db.data.users[m.sender]
    if (!user) {
      global.db.data.users[m.sender] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      user = global.db.data.users[m.sender]
    }

    
    if (!user.banco) user.banco = null
    if (!user.bancoDinero) user.bancoDinero = 0

    
    switch (command) {
      case 'banco':
      case 'bank':
        return mostrarInfoBancoUsuario(user, conn, m)

      case 'deposit':
        return depositarDinero(user, args[0], conn, m, usedPrefix)

      case 'withdraw':
        return retirarDinero(user, args[0], conn, m, usedPrefix)

      case 'change':
        return cambiarBanco(user, args[0], conn, m, usedPrefix)

      case 'unirsebank':
        return unirseBanco(user, args[0], conn, m, usedPrefix)

      default:
        return mostrarInfoBancoUsuario(user, conn, m)
    }

  } catch (e) {
    console.error('Error en banco:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error en el sistema bancario.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

function mostrarInfoBancoUsuario(user, conn, m) {
  if (!user.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa #unirsebank <banco>\n> *Bancos:* konoha, akatsuki, boys`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[user.banco]
  const totalDinero = user.coins + user.bancoDinero

  let txt = `🌴 ${banco.nombre}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗱𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲: ${user.coins} ${global.moneda}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗲𝗻 𝗯𝗮𝗻𝗰𝗼: ${user.bancoDinero}\n> 𝗧𝗼𝘁𝗮𝗹: ${totalDinero} ${global.moneda} Comandos:\n> 𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝗱𝗲 𝗯𝗮𝗻𝗰𝗼\n> .deposit <cantidad/all> - Depositar\n> .withdraw <cantidad/all> - Retirar\n .change <banco> - Cambiar banco`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function unirseBanco(user, bancoElegido, conn, m, usedPrefix) {
  if (user.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ya perteneces a ${bancos[user.banco].nombre}.\nUsa .change <banco> para cambiar.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!bancoElegido || !bancos[bancoElegido]) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Banco no valido. Elige: konoha, akatsuki, o boys`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  user.banco = bancoElegido
  const banco = bancos[bancoElegido]

  let txt = `🌴 𝗧𝗲 𝗵𝗮𝘀 𝘂𝗻𝗶𝗱𝗼 𝗮 𝘂𝗻 𝗯𝗮𝗻𝗰𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n> 𝗧𝘂 𝗯𝗮𝗻𝗰𝗼: ${banco.nombre}\n> 𝗗𝗲𝘀𝗰𝗿𝗶𝗽𝗰𝗶𝗼́𝗻: ${banco.descripcion}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗲𝗻 𝗯𝗮𝗻𝗰𝗼: ${user.bancoDinero} ${global.moneda}`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function cambiarBanco(user, bancoElegido, conn, m, usedPrefix) {
  if (!user.banco) {
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

  if (user.banco === bancoElegido) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ya perteneces a ${bancos[user.banco].nombre}.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (user.coins < costoCambioBanco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cambio de banco cuesta ${costoCambioBanco} ${global.moneda}.\n> *Tienes:* ${user.coins} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const bancoAnterior = bancos[user.banco]
  user.coins -= costoCambioBanco
  user.banco = bancoElegido
  const bancoNuevo = bancos[bancoElegido]

  let txt = `🌴 𝗛𝗮𝘀 𝗰𝗮𝗺𝗯𝗶𝗮𝗱𝗼 𝗱𝗲 𝗯𝗮𝗻𝗰𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n> 𝗔𝗻𝘁𝗲𝘀: ${bancoAnterior.nombre}\n> 𝗔𝗵𝗼𝗿𝗮: ${bancoNuevo.nombre}\n> 𝗖𝗼𝘀𝘁𝗼: ${costoCambioBanco} ${global.moneda}`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function depositarDinero(user, cantidad, conn, m, usedPrefix) {
  if (!user.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa .unirsebank <banco> para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0

  if (cantidad === 'all' || cantidad === 'todo') {
    
    if (user.coins === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Tu dinero ya esta completamente en el banco.\n> Dinero en banco: ${user.bancoDinero} ${global.moneda}\n> Usa .withdraw <cantidad> para retirar.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = user.coins
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cantidad invalida\n> Usa: .deposit <cantidad> o .deposit all`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (user.coins < monto) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No tienes suficientes ${global.moneda}.\n> Tienes: ${user.coins} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  user.coins -= monto
  user.bancoDinero += monto
  const banco = bancos[user.banco]

  let txt = `🌴 *${banco.nombre}*\n> 𝗗𝗲𝗽𝗼𝘀𝗶𝘁𝗮𝗱𝗼: ${monto} ${global.moneda}\n> 𝗘𝗻 𝗯𝗮𝗻𝗰𝗼: ${user.bancoDinero}\n> 𝗗𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲: ${user.coins} ${global.moneda}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗽𝗿𝗼𝘁𝗲𝗴𝗶𝗱𝗼 𝗱𝗲𝗹 𝗿𝗼𝗯𝗼`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function retirarDinero(user, cantidad, conn, m, usedPrefix) {
  if (!user.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningun banco\n> Usa .unirsebank <banco> para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0

  if (cantidad === 'all' || cantidad === 'todo') {
    
    if (user.bancoDinero === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No tienes dinero en el banco\n> Dinero disponible: ${user.coins} ${global.moneda}\n> Usa .deposit <cantidad> para guardar dinero.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = user.bancoDinero
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Cantidad invalida\n> Usa: .withdraw <cantidad> o .withdraw all`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (user.bancoDinero < monto) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No tienes suficientes ${global.moneda} en el banco.\n> En banco: ${user.bancoDinero} ${global.moneda}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  user.coins += monto
  user.bancoDinero -= monto
  const banco = bancos[user.banco]

  let txt = `🌴 𝗛𝗮𝘀 𝗿𝗲𝘁𝗶𝗿𝗮𝗱𝗼 𝗱𝗶𝗻𝗲𝗿𝗼 𝗱𝗲𝗹 𝗯𝗮𝗻𝗰𝗼\n> Retirado: ${monto} ${global.moneda}\n> En banco: ${user.bancoDinero} ${global.moneda}\n> 𝗖𝘂𝗶𝗱𝗮𝗱𝗼, 𝘁𝗲 𝗽𝘂𝗲𝗱𝗲𝗻 𝗿𝗼𝗯𝗮𝗿.`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function verSaldoBanco(user, conn, m) {
  if (!user.banco) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No perteneces a ningún banco.\n> Usa *${usedPrefix}banco unirse <banco>* para unirte.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[user.banco]
  const totalDinero = user.coins + user.bancoDinero

  let txt = `🌴 𝗜𝗡𝗙𝗢 𝗕𝗔𝗡𝗖𝗢\n> ${banco.emoji} ${banco.nombre}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗱𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲: ${user.coins} ${global.moneda}\n> 𝗗𝗶𝗻𝗲𝗿𝗼 𝗲𝗻 𝗯𝗮𝗻𝗰𝗼: ${user.bancoDinero} ${global.moneda}\n> 𝗧𝗼𝘁𝗮𝗹: ${totalDinero}`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function mostrarInfoBanco(user, conn, m) {
  let txt = `🌴 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗖𝗜𝗢𝗡 𝗕𝗔𝗡𝗖𝗔𝗥𝗜𝗔 🌴
  𝗞 BANK KONOHA
> Banco tradicional con intereses moderados

  𝗔 BANK AKATSUKI
> Banco misterioso con altos riesgos y recompensas

  𝗕 BANK BOYS
> Banco juvenil con servicios modernos
> Cambio de banco: ${costoCambioBanco} ${global.moneda}`

  return conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.help = ['banco', 'bank']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['banco', 'bank', 'deposit', 'withdraw', 'change', 'unirsebank']

export default handler
