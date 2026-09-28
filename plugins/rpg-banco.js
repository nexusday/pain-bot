import { tr } from '../lib/lang.js'
import {
  bancos,
  claveBanco,
  historialDe,
  montoMaximo,
  diasMaximos,
  cotizar,
  prestamoActivo,
  pedirPrestamo,
  pagarPrestamo,
  cobrarPrestamoSiToca,
  textoCobro,
  diasRestantes,
  resumenBancos,
} from '../lib/banco-prestamo.js'

const costoCambioBanco = 350

global.bancos = bancos

function asegurar(usuario, m) {
  if (!usuario.banco) usuario.banco = null
  if (!Number.isFinite(usuario.bancoDinero)) usuario.bancoDinero = 0
  if (!Number.isFinite(usuario.coins)) usuario.coins = 0
  if (!usuario.name) usuario.name = m.name || m.pushName || 'Usuario'
}

function moneda() {
  return global.moneda || 'USD'
}

function ficha(titulo, lineas) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo}*
╰─ ✧  ✩
${lineas}
╰─────────`.trim()
}

function listaClaves() {
  return resumenBancos().map(banco => banco.id).join(', ')
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          '[❗] Este comando solo puede ser usado en grupos.',
          '[❗] This command only works in groups.',
          '[❗] Este comando só pode ser usado em grupos.',
        ),
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

    asegurar(usuario, m)
    const soloManual = ['pagar', 'pay', 'pagarprestamo', 'prestamo', 'loan', 'préstamo'].includes(command)
    const cobro = soloManual ? null : cobrarPrestamoSiToca(usuario)

    if (cobro?.tomado > 0 && command !== 'banco' && command !== 'bank') {
      return conn.sendMessage(m.chat, {
        text: textoCobro(conn, cobro),
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    switch (command) {
      case 'banco':
      case 'bank':
        return mostrarInfoBancoUsuario(usuario, conn, m, usedPrefix, cobro)
      case 'deposit':
        return depositarDinero(usuario, args[0], conn, m, usedPrefix)
      case 'withdraw':
        return retirarDinero(usuario, args[0], conn, m, usedPrefix)
      case 'change':
        return cambiarBanco(usuario, args[0], conn, m, usedPrefix)
      case 'unirsebank':
        return unirseBanco(usuario, args[0], conn, m, usedPrefix)
      case 'prestamo':
      case 'loan':
      case 'préstamo':
        return pedir(usuario, args, conn, m, usedPrefix)
      case 'pagar':
      case 'pay':
      case 'pagarprestamo':
        return pagar(usuario, args[0], conn, m, usedPrefix)
      default:
        return mostrarInfoBancoUsuario(usuario, conn, m, usedPrefix, cobro)
    }
  } catch (error) {
    console.error('Error en banco:', error)
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        '[❌] Ocurrió un error en el sistema bancario.',
        '[❌] Something went wrong in the bank system.',
        '[❌] Ocorreu um erro no sistema do banco.',
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

function lineaCobro(conn, cobro) {
  if (!cobro || cobro.tomado <= 0) return ''
  const nombre = moneda()
  if (cobro.cerrado) {
    return `┊ ${tr(conn, 'cobrado', 'collected', 'cobrado')}  ·  \`${cobro.tomado} ${nombre}\`\n┊ ${tr(conn, 'préstamo saldado', 'loan paid off', 'empréstimo pago')}\n`
  }
  return `┊ ${tr(conn, 'cobrado', 'collected', 'cobrado')}  ·  \`${cobro.tomado} ${nombre}\`\n┊ ${tr(conn, 'sigue debiendo', 'still owes', 'ainda deve')}  ·  \`${cobro.queda} ${nombre}\`\n`
}

function mostrarInfoBancoUsuario(usuario, conn, m, usedPrefix, cobro) {
  if (!usuario.banco || !bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No perteneces a ningún banco.\n> ${usedPrefix}unirsebank <banco>\n> *Bancos:* ${listaClaves()}`,
        `[❗] You are not in a bank.\n> ${usedPrefix}unirsebank <bank>\n> *Banks:* ${listaClaves()}`,
        `[❗] Não pertences a nenhum banco.\n> ${usedPrefix}unirsebank <banco>\n> *Bancos:* ${listaClaves()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[usuario.banco]
  const historial = historialDe(usuario)
  const prestamo = prestamoActivo(usuario)
  const nombre = moneda()
  const totalDinero = usuario.coins + usuario.bancoDinero
  let extra = ''
  if (prestamo) {
    const vencido = Date.now() >= prestamo.vence
    extra = vencido
      ? `┊ ${tr(conn, 'préstamo vencido', 'loan overdue', 'empréstimo vencido')}  ·  \`${prestamo.deuda} ${nombre}\`\n`
      : `┊ ${tr(conn, 'préstamo', 'loan', 'empréstimo')}  ·  \`${prestamo.deuda} ${nombre}\`\n┊ ${tr(conn, 'días', 'days', 'dias')}  ·  \`${diasRestantes(prestamo)}\`\n`
  }

  const texto = ficha(banco.nombre, [
    `┊ ${tr(conn, banco.es, banco.en, banco.pt)}`,
    lineaCobro(conn, cobro).trimEnd(),
    `┊ ${tr(conn, 'disponible', 'available', 'disponível')}  ·  \`${usuario.coins} ${nombre}\``,
    `┊ ${tr(conn, 'en banco', 'in bank', 'no banco')}  ·  \`${usuario.bancoDinero} ${nombre}\``,
    `┊ ${tr(conn, 'total', 'total', 'total')}  ·  \`${totalDinero} ${nombre}\``,
    extra.trimEnd(),
    `┊ ${tr(conn, 'a tiempo', 'on time', 'a tempo')}  ·  \`${historial.aTiempo}\``,
    `┊ ${tr(conn, 'atrasos', 'late', 'atrasos')}  ·  \`${historial.atrasos}\``,
    `┊ ${usedPrefix}prestamo  ·  \`<cantidad> <días>\``,
    `┊ ${usedPrefix}pagar  ·  \`<cantidad / all>\``,
  ].filter(Boolean).join('\n'))

  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function unirseBanco(usuario, bancoElegido, conn, m, usedPrefix) {
  if (usuario.banco && bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Ya perteneces a ${bancos[usuario.banco].nombre}.\n> ${usedPrefix}change <banco>`,
        `[❗] You already belong to ${bancos[usuario.banco].nombre}.\n> ${usedPrefix}change <bank>`,
        `[❗] Já pertences a ${bancos[usuario.banco].nombre}.\n> ${usedPrefix}change <banco>`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const clave = claveBanco(bancoElegido)
  if (!clave) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Banco no válido. Elige: ${listaClaves()}`,
        `[❗] Invalid bank. Choose: ${listaClaves()}`,
        `[❗] Banco inválido. Escolhe: ${listaClaves()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.banco = clave
  const banco = bancos[clave]
  return conn.sendMessage(m.chat, {
    text: ficha(banco.nombre, `┊ ${tr(conn, banco.es, banco.en, banco.pt)}\n┊ ${tr(conn, 'en banco', 'in bank', 'no banco')}  ·  \`${usuario.bancoDinero} ${moneda()}\``),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function cambiarBanco(usuario, bancoElegido, conn, m, usedPrefix) {
  if (!usuario.banco || !bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No perteneces a ningún banco.\n> ${usedPrefix}unirsebank <banco>`,
        `[❗] You are not in a bank.\n> ${usedPrefix}unirsebank <bank>`,
        `[❗] Não pertences a nenhum banco.\n> ${usedPrefix}unirsebank <banco>`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (prestamoActivo(usuario)) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        '[❗] Tienes un préstamo abierto. Págalo antes de cambiar de banco.',
        '[❗] You have an open loan. Pay it before switching banks.',
        '[❗] Tens um empréstimo aberto. Paga-o antes de mudares de banco.',
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const clave = claveBanco(bancoElegido)
  if (!clave) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Banco no válido. Elige: ${listaClaves()}`,
        `[❗] Invalid bank. Choose: ${listaClaves()}`,
        `[❗] Banco inválido. Escolhe: ${listaClaves()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.banco === clave) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Ya perteneces a ${bancos[usuario.banco].nombre}.`,
        `[❗] You already belong to ${bancos[usuario.banco].nombre}.`,
        `[❗] Já pertences a ${bancos[usuario.banco].nombre}.`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.coins < costoCambioBanco) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Cambiar de banco cuesta ${costoCambioBanco} ${moneda()}.\n> *Tienes:* ${usuario.coins} ${moneda()}`,
        `[❗] Switching banks costs ${costoCambioBanco} ${moneda()}.\n> *You have:* ${usuario.coins} ${moneda()}`,
        `[❗] Mudar de banco custa ${costoCambioBanco} ${moneda()}.\n> *Tens:* ${usuario.coins} ${moneda()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const bancoAnterior = bancos[usuario.banco]
  usuario.coins -= costoCambioBanco
  usuario.banco = clave
  const bancoNuevo = bancos[clave]

  return conn.sendMessage(m.chat, {
    text: ficha(bancoNuevo.nombre, `┊ ${tr(conn, 'antes', 'before', 'antes')}  ·  \`${bancoAnterior.nombre}\`\n┊ ${tr(conn, 'costo', 'cost', 'custo')}  ·  \`${costoCambioBanco} ${moneda()}\``),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function depositarDinero(usuario, cantidad, conn, m, usedPrefix) {
  if (!usuario.banco || !bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No perteneces a ningún banco.\n> ${usedPrefix}unirsebank <banco>`,
        `[❗] You are not in a bank.\n> ${usedPrefix}unirsebank <bank>`,
        `[❗] Não pertences a nenhum banco.\n> ${usedPrefix}unirsebank <banco>`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0
  if (cantidad === 'all' || cantidad === 'todo') {
    if (usuario.coins === 0) {
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          `[❗] Tu dinero ya está en el banco.\n> ${tr(conn, 'En banco', 'In bank', 'No banco')}: ${usuario.bancoDinero} ${moneda()}`,
          `[❗] Your money is already in the bank.\n> ${tr(conn, 'En banco', 'In bank', 'No banco')}: ${usuario.bancoDinero} ${moneda()}`,
          `[❗] O teu dinheiro já está no banco.\n> ${tr(conn, 'En banco', 'In bank', 'No banco')}: ${usuario.bancoDinero} ${moneda()}`,
        ),
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = usuario.coins
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Cantidad inválida.\n> ${usedPrefix}deposit <cantidad> ${tr(conn, 'o', 'or', 'ou')} ${usedPrefix}deposit all`,
        `[❗] Invalid amount.\n> ${usedPrefix}deposit <amount> or ${usedPrefix}deposit all`,
        `[❗] Quantia inválida.\n> ${usedPrefix}deposit <quantia> ou ${usedPrefix}deposit all`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.coins < monto) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No tienes suficientes ${moneda()}.\n> ${tr(conn, 'Tienes', 'You have', 'Tens')}: ${usuario.coins} ${moneda()}`,
        `[❗] You do not have enough ${moneda()}.\n> You have: ${usuario.coins} ${moneda()}`,
        `[❗] Não tens ${moneda()} suficientes.\n> Tens: ${usuario.coins} ${moneda()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.coins -= monto
  usuario.bancoDinero += monto
  const banco = bancos[usuario.banco]
  return conn.sendMessage(m.chat, {
    text: ficha(banco.nombre, `┊ ${tr(conn, 'depositado', 'deposited', 'depositado')}  ·  \`${monto} ${moneda()}\`\n┊ ${tr(conn, 'en banco', 'in bank', 'no banco')}  ·  \`${usuario.bancoDinero} ${moneda()}\`\n┊ ${tr(conn, 'disponible', 'available', 'disponível')}  ·  \`${usuario.coins} ${moneda()}\``),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function retirarDinero(usuario, cantidad, conn, m, usedPrefix) {
  if (!usuario.banco || !bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No perteneces a ningún banco.\n> ${usedPrefix}unirsebank <banco>`,
        `[❗] You are not in a bank.\n> ${usedPrefix}unirsebank <bank>`,
        `[❗] Não pertences a nenhum banco.\n> ${usedPrefix}unirsebank <banco>`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  let monto = 0
  if (cantidad === 'all' || cantidad === 'todo') {
    if (usuario.bancoDinero === 0) {
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          `[❗] No tienes dinero en el banco.\n> ${tr(conn, 'Disponible', 'Available', 'Disponível')}: ${usuario.coins} ${moneda()}`,
          `[❗] You have no money in the bank.\n> Available: ${usuario.coins} ${moneda()}`,
          `[❗] Não tens dinheiro no banco.\n> Disponível: ${usuario.coins} ${moneda()}`,
        ),
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    monto = usuario.bancoDinero
  } else {
    monto = parseInt(cantidad)
  }

  if (!monto || isNaN(monto) || monto <= 0) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Cantidad inválida.\n> ${usedPrefix}withdraw <cantidad> ${tr(conn, 'o', 'or', 'ou')} ${usedPrefix}withdraw all`,
        `[❗] Invalid amount.\n> ${usedPrefix}withdraw <amount> or ${usedPrefix}withdraw all`,
        `[❗] Quantia inválida.\n> ${usedPrefix}withdraw <quantia> ou ${usedPrefix}withdraw all`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (usuario.bancoDinero < monto) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No tienes suficientes ${moneda()} en el banco.\n> ${tr(conn, 'En banco', 'In bank', 'No banco')}: ${usuario.bancoDinero} ${moneda()}`,
        `[❗] You do not have enough ${moneda()} in the bank.\n> In bank: ${usuario.bancoDinero} ${moneda()}`,
        `[❗] Não tens ${moneda()} suficientes no banco.\n> No banco: ${usuario.bancoDinero} ${moneda()}`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.coins += monto
  usuario.bancoDinero -= monto
  const banco = bancos[usuario.banco]
  return conn.sendMessage(m.chat, {
    text: ficha(banco.nombre, `┊ ${tr(conn, 'retirado', 'withdrawn', 'levantado')}  ·  \`${monto} ${moneda()}\`\n┊ ${tr(conn, 'en banco', 'in bank', 'no banco')}  ·  \`${usuario.bancoDinero} ${moneda()}\`\n┊ ${tr(conn, 'disponible', 'available', 'disponível')}  ·  \`${usuario.coins} ${moneda()}\``),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function pedir(usuario, args, conn, m, usedPrefix) {
  if (!usuario.banco || !bancos[usuario.banco]) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] No perteneces a ningún banco.\n> ${usedPrefix}unirsebank <banco>`,
        `[❗] You are not in a bank.\n> ${usedPrefix}unirsebank <bank>`,
        `[❗] Não pertences a nenhum banco.\n> ${usedPrefix}unirsebank <banco>`,
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[usuario.banco]
  const historial = historialDe(usuario)
  const maximo = montoMaximo(usuario, banco)
  const diasDelTope = diasMaximos(maximo, banco, historial)
  if (!args[0]) {
    const diasEjemplo = Math.min(7, diasDelTope)
    const ejemplo = cotizar(banco, historial, maximo, diasEjemplo)
    const porciento = Math.round(ejemplo.porcentaje * 1000) / 10
    return conn.sendMessage(m.chat, {
      text: ficha(banco.nombre, [
        `┊ ${tr(conn, 'tope', 'cap', 'teto')}  ·  \`${maximo} ${moneda()}\``,
        `┊ ${tr(conn, 'días máx', 'max days', 'dias máx')}  ·  \`${diasDelTope}\``,
        `┊ ${tr(conn, 'ejemplo', 'example', 'exemplo')}  ·  \`${porciento}%\``,
        `┊ ${usedPrefix}prestamo 4000 7`,
      ].join('\n')),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const monto = parseInt(args[0])
  const dias = args[1] ? parseInt(args[1]) : 5
  const resultado = pedirPrestamo(usuario, monto, dias)
  if (!resultado.ok) {
    const razon = razonPrestamo(conn, resultado, usedPrefix)
    return conn.sendMessage(m.chat, {
      text: razon,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const porciento = Math.round(resultado.quote.porcentaje * 1000) / 10
  return conn.sendMessage(m.chat, {
    text: ficha(resultado.banco.nombre, [
      `┊ ${tr(conn, 'prestado', 'lent', 'emprestado')}  ·  \`${monto} ${moneda()}\``,
      `┊ ${tr(conn, 'interés', 'interest', 'juros')}  ·  \`${porciento}%  ·  ${resultado.quote.interes} ${moneda()}\``,
      `┊ ${tr(conn, 'a devolver', 'to repay', 'a devolver')}  ·  \`${resultado.quote.deuda} ${moneda()}\``,
      `┊ ${tr(conn, 'plazo', 'term', 'prazo')}  ·  \`${resultado.dias} ${tr(conn, 'días', 'days', 'dias')}\``,
      `┊ ${tr(conn, 'disponible', 'available', 'disponível')}  ·  \`${usuario.coins} ${moneda()}\``,
    ].join('\n')),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

function razonPrestamo(conn, resultado, usedPrefix) {
  const nombre = moneda()
  if (resultado.error === 'ya') {
    return tr(conn,
      '[❗] Ya tienes un préstamo. Págalo con ' + usedPrefix + 'pagar.',
      '[❗] You already have a loan. Pay it with ' + usedPrefix + 'pagar.',
      '[❗] Já tens um empréstimo. Paga-o com ' + usedPrefix + 'pagar.',
    )
  }
  if (resultado.error === 'minimo') {
    return tr(conn,
      `[❗] El mínimo es *${resultado.minimo} ${nombre}* y tu tope es *${resultado.maximo} ${nombre}*.`,
      `[❗] The minimum is *${resultado.minimo} ${nombre}* and your cap is *${resultado.maximo} ${nombre}*.`,
      `[❗] O mínimo é *${resultado.minimo} ${nombre}* e o teu teto é *${resultado.maximo} ${nombre}*.`,
    )
  }
  if (resultado.error === 'tope') {
    return tr(conn,
      `[❗] Este banco te presta hasta *${resultado.maximo} ${nombre}* según lo que tienes y tu historial.`,
      `[❗] This bank lends you up to *${resultado.maximo} ${nombre}* based on your money and history.`,
      `[❗] Este banco empresta-te até *${resultado.maximo} ${nombre}* segundo o que tens e o teu histórico.`,
    )
  }
  return tr(conn,
    `[❗] Para ese monto el plazo máximo es *${resultado.maxDias}* días. No pasa de 29.`,
    `[❗] For that amount the max term is *${resultado.maxDias}* days. It never goes past 29.`,
    `[❗] Para essa quantia o prazo máximo é *${resultado.maxDias}* dias. Não passa de 29.`,
  )
}

function pagar(usuario, cantidad, conn, m, usedPrefix) {
  const pedido = !cantidad || cantidad === 'all' || cantidad === 'todo' ? 'all' : parseInt(cantidad)
  const resultado = pagarPrestamo(usuario, pedido)
  if (!resultado.ok) {
    const texto = resultado.error === 'nada'
      ? tr(conn, '[❗] No tienes un préstamo abierto.', '[❗] You do not have an open loan.', '[❗] Não tens um empréstimo aberto.')
      : resultado.error === 'sin-dinero'
        ? tr(conn,
          `[❗] No tienes ${moneda()} ni en el bolsillo ni en el banco. Sigues debiendo *${resultado.deuda} ${moneda()}*.`,
          `[❗] You have no ${moneda()} in your pocket or in the bank. You still owe *${resultado.deuda} ${moneda()}*.`,
          `[❗] Não tens ${moneda()} no bolso nem no banco. Ainda deves *${resultado.deuda} ${moneda()}*.`,
        )
        : tr(conn,
          `[❗] Cantidad inválida.\n> ${usedPrefix}pagar <cantidad> ${tr(conn, 'o', 'or', 'ou')} ${usedPrefix}pagar all`,
          `[❗] Invalid amount.\n> ${usedPrefix}pagar <amount> or ${usedPrefix}pagar all`,
          `[❗] Quantia inválida.\n> ${usedPrefix}pagar <quantia> ou ${usedPrefix}pagar all`,
        )
    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const banco = bancos[usuario.banco]
  const lineas = [
    `┊ ${tr(conn, 'pagado', 'paid', 'pago')}  ·  \`${resultado.pagado} ${moneda()}\``,
  ]
  if (resultado.descuento > 0) {
    lineas.push(`┊ ${tr(conn, 'descuento por anticipado', 'early discount', 'desconto por antecipação')}  ·  \`${resultado.descuento} ${moneda()}\``)
  }
  lineas.push(resultado.cerrado
    ? `┊ ${tr(conn, 'préstamo saldado', 'loan paid off', 'empréstimo pago')}`
    : `┊ ${tr(conn, 'sigue debiendo', 'still owes', 'ainda deve')}  ·  \`${resultado.queda} ${moneda()}\``)
  lineas.push(`┊ ${tr(conn, 'disponible', 'available', 'disponível')}  ·  \`${usuario.coins} ${moneda()}\``)

  return conn.sendMessage(m.chat, {
    text: ficha(banco?.nombre || tr(conn, 'banco', 'bank', 'banco'), lineas.join('\n')),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.help = ['banco', 'bank']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['banco', 'bank', 'deposit', 'withdraw', 'change', 'unirsebank', 'prestamo', 'loan', 'préstamo', 'pagar', 'pay', 'pagarprestamo']

export default handler
