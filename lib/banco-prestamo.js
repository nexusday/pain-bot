import { tr } from './lang.js'

export const bancos = {
  konoha: {
    id: 'konoha',
    nombre: 'KONOHA',
    diario: 0.012,
    tope: 8000,
    multiplo: 2,
    es: 'Préstamos cortos y baratos. Si te atrasas, la siguiente tasa sube.',
    en: 'Short, cheap loans. If you are late, the next rate goes up.',
    pt: 'Empréstimos curtos e baratos. Se te atrasares, a taxa seguinte sobe.',
  },
  akatsuki: {
    id: 'akatsuki',
    nombre: 'AKATSUKI',
    diario: 0.022,
    tope: 18000,
    multiplo: 3.2,
    es: 'Presta más y cobra más. Pasar de 10 días sale caro.',
    en: 'Lends more and charges more. Past 10 days it gets expensive.',
    pt: 'Empresta mais e cobra mais. Passar de 10 dias sai caro.',
  },
  boys: {
    id: 'boys',
    nombre: 'BANK BOYS',
    diario: 0.015,
    tope: 12000,
    multiplo: 2.4,
    es: 'Tasa media. Los préstamos de pocos días casi no pesan.',
    en: 'Middle rate. Loans of just a few days barely weigh.',
    pt: 'Taxa média. Empréstimos de poucos dias quase não pesam.',
  },
  girls: {
    id: 'girls',
    nombre: 'BANK GIRLS',
    diario: 0.014,
    tope: 12000,
    multiplo: 2.4,
    es: 'Parecido a Boys, un poco más suave si pides 5 días o menos.',
    en: 'Close to Boys, a bit softer if you ask for 5 days or less.',
    pt: 'Parecido com Boys, um pouco mais leve se pedires 5 dias ou menos.',
  },
}

const DIA = 24 * 60 * 60 * 1000
const MINIMO = 200
const TOPE_DIAS = 29

export function claveBanco(entrada) {
  const texto = String(entrada || '').trim().toLowerCase().replace(/\s+/g, '')
  if (['konoha', 'bankkonoha'].includes(texto)) return 'konoha'
  if (['akatsuki', 'bankakatsuki'].includes(texto)) return 'akatsuki'
  if (['boys', 'bankboys', 'boy'].includes(texto)) return 'boys'
  if (['girls', 'bankgirls', 'girl'].includes(texto)) return 'girls'
  return null
}

export function historialDe(usuario) {
  if (!usuario.bancoHistorial || typeof usuario.bancoHistorial !== 'object') {
    usuario.bancoHistorial = { aTiempo: 0, atrasos: 0, pedidos: 0 }
  }
  const h = usuario.bancoHistorial
  h.aTiempo = Number(h.aTiempo) || 0
  h.atrasos = Number(h.atrasos) || 0
  h.pedidos = Number(h.pedidos) || 0
  return h
}

function ajusteHistorial(historial) {
  const nota = historial.aTiempo * 2 - historial.atrasos * 4
  return Math.max(-0.4, Math.min(0.5, -nota * 0.04))
}

function factorDias(dias) {
  if (dias <= 5) return 0.75
  if (dias <= 10) return 1
  if (dias <= 20) return 1.55
  return 2.1
}

function diarioDe(banco, dias) {
  if (banco.id === 'girls' && dias <= 5) return banco.diario * 0.8
  if (banco.id === 'boys' && dias <= 3) return banco.diario * 0.85
  return banco.diario
}

export function montoMaximo(usuario, banco) {
  const bolsa = Math.max(0, Number(usuario.coins) || 0)
  const caja = Math.max(0, Number(usuario.bancoDinero) || 0)
  const historial = historialDe(usuario)
  let tope = Math.floor(Math.max(800, (bolsa + caja) * banco.multiplo))
  tope = Math.min(banco.tope, tope)
  if (historial.atrasos > historial.aTiempo) tope = Math.floor(tope * 0.6)
  return Math.max(MINIMO, tope)
}

export function diasMaximos(monto, banco, historial) {
  let tope = 10
  if (monto <= 1500) tope = 7
  else if (monto <= 6000) tope = 10
  else if (monto <= 12000) tope = 16
  else tope = 21
  if (banco.id === 'akatsuki' && monto > 8000) tope += 4
  const confianza = historial.aTiempo - historial.atrasos
  if (confianza >= 3) tope += 5
  if (confianza <= -2) tope = Math.min(tope, 7)
  return Math.max(1, Math.min(TOPE_DIAS, tope))
}

export function cotizar(banco, historial, monto, dias) {
  const tasa = diarioDe(banco, dias) * dias * factorDias(dias) * (1 + ajusteHistorial(historial))
  const porcentaje = Math.min(0.48, Math.max(0.02, tasa))
  const interes = Math.round(monto * porcentaje)
  return {
    porcentaje,
    interes,
    deuda: monto + interes,
  }
}

export function prestamoActivo(usuario) {
  const prestamo = usuario?.prestamo
  if (!prestamo || typeof prestamo !== 'object') return null
  if (!Number.isFinite(prestamo.deuda) || prestamo.deuda <= 0) return null
  return prestamo
}

function cerrarPrestamo(usuario, aTiempo) {
  const historial = historialDe(usuario)
  if (aTiempo) historial.aTiempo += 1
  usuario.prestamo = null
}

function descuentoAnticipado(prestamo) {
  const total = Math.max(1, prestamo.dias * DIA)
  const queda = Math.max(0, prestamo.vence - Date.now())
  const parte = Math.min(1, queda / total)
  return Math.floor((prestamo.interes || 0) * parte * 0.5)
}

export function pedirPrestamo(usuario, monto, dias) {
  const banco = bancos[usuario.banco]
  if (!banco) return { ok: false, error: 'sin-banco' }
  if (prestamoActivo(usuario)) return { ok: false, error: 'ya' }
  const historial = historialDe(usuario)
  const maximo = montoMaximo(usuario, banco)
  if (!Number.isFinite(monto) || monto < MINIMO) return { ok: false, error: 'minimo', minimo: MINIMO, maximo }
  if (monto > maximo) return { ok: false, error: 'tope', maximo }
  const maxDias = diasMaximos(monto, banco, historial)
  if (!Number.isFinite(dias) || dias < 1) return { ok: false, error: 'dias', maxDias }
  if (dias > maxDias || dias > TOPE_DIAS) return { ok: false, error: 'dias', maxDias }
  const quote = cotizar(banco, historial, monto, dias)
  historial.pedidos += 1
  usuario.coins = (Number(usuario.coins) || 0) + monto
  usuario.prestamo = {
    banco: banco.id,
    capital: monto,
    interes: quote.interes,
    deuda: quote.deuda,
    dias,
    vence: Date.now() + dias * DIA,
    marcadoAtraso: false,
  }
  return { ok: true, banco, quote, dias, maxDias }
}

export function pagarPrestamo(usuario, cantidad) {
  const prestamo = prestamoActivo(usuario)
  if (!prestamo) return { ok: false, error: 'nada' }
  const anticipado = Date.now() < prestamo.vence
  let deuda = prestamo.deuda
  let descuento = 0
  if (anticipado && (cantidad === 'all' || cantidad >= deuda)) {
    descuento = descuentoAnticipado(prestamo)
    deuda = Math.max(prestamo.capital, deuda - descuento)
    prestamo.deuda = deuda
  }
  const pedido = cantidad === 'all' ? deuda : cantidad
  if (!Number.isFinite(pedido) || pedido <= 0) return { ok: false, error: 'cantidad' }
  let falta = Math.min(pedido, prestamo.deuda)
  const deBolsillo = Math.min(Math.max(0, Number(usuario.coins) || 0), falta)
  usuario.coins -= deBolsillo
  falta -= deBolsillo
  const deBanco = Math.min(Math.max(0, Number(usuario.bancoDinero) || 0), falta)
  usuario.bancoDinero = (Number(usuario.bancoDinero) || 0) - deBanco
  const pagado = deBolsillo + deBanco
  prestamo.deuda -= pagado
  if (pagado <= 0) return { ok: false, error: 'sin-dinero', deuda: prestamo.deuda }
  if (prestamo.deuda <= 0) {
    const aTiempo = !prestamo.marcadoAtraso
    cerrarPrestamo(usuario, aTiempo)
    return { ok: true, pagado, descuento, queda: 0, cerrado: true, aTiempo }
  }
  return { ok: true, pagado, descuento, queda: prestamo.deuda, cerrado: false }
}

/** Si ya venció, come primero el bolsillo y después lo que hay en el banco. Lo que falte sigue pendiente. */
export function cobrarPrestamoSiToca(usuario) {
  const prestamo = prestamoActivo(usuario)
  if (!prestamo) return null
  if (Date.now() < prestamo.vence) return null

  const antes = prestamo.deuda
  const deBolsillo = Math.min(Math.max(0, Number(usuario.coins) || 0), prestamo.deuda)
  usuario.coins = (Number(usuario.coins) || 0) - deBolsillo
  prestamo.deuda -= deBolsillo
  const deBanco = Math.min(Math.max(0, Number(usuario.bancoDinero) || 0), prestamo.deuda)
  usuario.bancoDinero = (Number(usuario.bancoDinero) || 0) - deBanco
  prestamo.deuda -= deBanco
  const tomado = deBolsillo + deBanco

  if (prestamo.deuda <= 0) {
    const atraso = prestamo.marcadoAtraso || tomado < antes
    if (!prestamo.marcadoAtraso && tomado < antes) {
      historialDe(usuario).atrasos += 1
      prestamo.marcadoAtraso = true
    }
    cerrarPrestamo(usuario, !atraso)
    return { tomado, queda: 0, cerrado: true, atrasado: atraso }
  }

  if (!prestamo.marcadoAtraso) {
    historialDe(usuario).atrasos += 1
    prestamo.marcadoAtraso = true
  }
  if (tomado <= 0) return { tomado: 0, queda: prestamo.deuda, espera: true, cerrado: false }
  return { tomado, queda: prestamo.deuda, cerrado: false, atrasado: true }
}

export function textoCobro(conn, cobro) {
  const moneda = global.moneda || 'USD'
  if (cobro.cerrado && cobro.tomado > 0) {
    return tr(conn,
      `[💳] El banco cobró *${cobro.tomado} ${moneda}* y el préstamo quedó saldado.`,
      `[💳] The bank took *${cobro.tomado} ${moneda}* and the loan is paid off.`,
      `[💳] O banco cobrou *${cobro.tomado} ${moneda}* e o empréstimo ficou pago.`,
    )
  }
  if (cobro.cerrado) {
    return tr(conn,
      `[💳] El préstamo quedó saldado.`,
      `[💳] The loan is paid off.`,
      `[💳] O empréstimo ficou pago.`,
    )
  }
  return tr(conn,
    `[💳] El banco cobró *${cobro.tomado} ${moneda}*. Aún debes *${cobro.queda} ${moneda}*. Lo que ganes se lo va a seguir llevando.`,
    `[💳] The bank took *${cobro.tomado} ${moneda}*. You still owe *${cobro.queda} ${moneda}*. Whatever you earn, it will keep taking.`,
    `[💳] O banco cobrou *${cobro.tomado} ${moneda}*. Ainda deves *${cobro.queda} ${moneda}*. O que ganhares ele vai continuar a levar.`,
  )
}

export function diasRestantes(prestamo) {
  return Math.max(0, Math.ceil((prestamo.vence - Date.now()) / DIA))
}

export function resumenBancos() {
  return Object.values(bancos)
}
