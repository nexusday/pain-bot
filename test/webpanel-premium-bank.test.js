import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PREMIUM_DEFECTOS, estadoPremium, sumarPremium } from '../lib/webpanel/premium.js'
import { guardarConfigSubBot, leerConfigSubBot } from '../lib/webpanel/subbot-config.js'

const HORA = 3_600_000
const MINUTO = 60_000
const PHONE = '5215512345678'
const ajustes = { ...PREMIUM_DEFECTOS, maxHours: 24, unlockHours: 9, adMinutes: 1 }

function escenario(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-premium-bank-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('premium: tras reabrir a las 9 h, 9 h 1 min y 10 h siguen permitiendo sumar hasta 24 h', t => {
  const root = escenario(t)
  const ahora = Date.now()
  guardarConfigSubBot(root, PHONE, { premium: { expiresAt: ahora + 24 * HORA, adBankLocked: true, adBankMaxHours: 24, ads: 5 } })
  assert.equal(estadoPremium(root, PHONE, ajustes, ahora + 14 * HORA).bloqueado, true)
  const reapertura = ahora + 15 * HORA
  assert.equal(estadoPremium(root, PHONE, ajustes, reapertura).puedeSumar, true)
  let estado = sumarPremium(root, PHONE, 1, ajustes, reapertura)
  assert.equal(estado.restanteMs, 9 * HORA + MINUTO)
  assert.equal(estado.bloqueado, false)
  assert.equal(estado.puedeSumar, true)
  estado = sumarPremium(root, PHONE, 60, ajustes, reapertura)
  assert.equal(estado.restanteMs, 10 * HORA + MINUTO)
  assert.equal(estado.puedeSumar, true)
  estado = sumarPremium(root, PHONE, 24 * 60, ajustes, reapertura)
  assert.equal(estado.restanteMs, 24 * HORA)
  assert.equal(estado.puedeSumar, false)
  assert.equal(estado.bloqueado, true)
  assert.equal(estadoPremium(root, PHONE, ajustes, reapertura + 2 * MINUTO).bloqueado, true, 'no se reabre un minuto después de llenar')
  assert.equal(estadoPremium(root, PHONE, ajustes, reapertura + 15 * HORA).puedeSumar, true)
})

test('premium: una carga nueva puede superar 9 h y no se bloquea antes del máximo exacto', t => {
  const root = escenario(t)
  const ahora = Date.now()
  const casiLleno = sumarPremium(root, PHONE, 24 * 60 - 1, ajustes, ahora)
  assert.equal(casiLleno.restanteMs, 24 * HORA - MINUTO)
  assert.equal(casiLleno.puedeSumar, true)
  assert.equal(sumarPremium(root, PHONE, 1, ajustes, ahora).bloqueado, true)
})

test('premium: el bloqueo y la reapertura se conservan al volver a cargar el módulo', async t => {
  const root = escenario(t)
  const ahora = Date.now()
  sumarPremium(root, PHONE, 24 * 60, ajustes, ahora)
  const reiniciado = await import('../lib/webpanel/premium.js?prueba-banco-reinicio')
  assert.equal(reiniciado.estadoPremium(root, PHONE, ajustes, ahora + HORA).bloqueado, true)
  estadoPremium(root, PHONE, ajustes, ahora + 15 * HORA)
  assert.equal(leerConfigSubBot(root, PHONE).premium.adBankLocked, false)
  const sumado = reiniciado.sumarPremium(root, PHONE, 1, ajustes, ahora + 15 * HORA)
  assert.equal(sumado.puedeSumar, true)
  assert.equal(estadoPremium(root, PHONE, ajustes, ahora + 15 * HORA).puedeSumar, true)
})

test('premium: migra un llenado anterior sin modificar vencimiento, anuncios ni personalizaciones', t => {
  const root = escenario(t)
  const ahora = Date.now()
  const premium = { expiresAt: ahora + 24 * HORA, lastClaimAt: ahora, ads: 24 }
  guardarConfigSubBot(root, PHONE, { premium, premiumEdits: { moneda: 'PEN' }, name: 'Mi bot' })
  assert.equal(estadoPremium(root, PHONE, ajustes, ahora + 12 * HORA).bloqueado, true)
  const guardado = leerConfigSubBot(root, PHONE)
  assert.equal(guardado.premium.expiresAt, premium.expiresAt)
  assert.equal(guardado.premium.lastClaimAt, premium.lastClaimAt)
  assert.equal(guardado.premium.ads, premium.ads)
  assert.equal(guardado.premiumEdits.moneda, 'PEN')
  assert.equal(guardado.name, 'Mi bot')
  assert.equal(estadoPremium(root, PHONE, ajustes, ahora + 15 * HORA).puedeSumar, true)
  assert.equal(sumarPremium(root, PHONE, 1, ajustes, ahora + 15 * HORA).puedeSumar, true)
})

test('premium: las horas antiguas que nunca llenaron el banco no se bloquean por superar el desbloqueo', t => {
  const root = escenario(t)
  const ahora = Date.now()
  guardarConfigSubBot(root, PHONE, { premium: { expiresAt: ahora + 9 * HORA + MINUTO, lastClaimAt: ahora, ads: 1 } })
  assert.equal(estadoPremium(root, PHONE, ajustes, ahora).puedeSumar, true)
})

test('premium: respeta otros límites y permite llenar un tope ampliado por administración', t => {
  const root = escenario(t)
  const ahora = Date.now()
  const reglas = { ...ajustes, maxHours: 36, unlockHours: 7 }
  sumarPremium(root, PHONE, 36 * 60, reglas, ahora)
  assert.equal(estadoPremium(root, PHONE, reglas, ahora + 28 * HORA).bloqueado, true)
  assert.equal(estadoPremium(root, PHONE, reglas, ahora + 29 * HORA).puedeSumar, true)
  assert.equal(sumarPremium(root, PHONE, 1, reglas, ahora + 29 * HORA).puedeSumar, true)
  sumarPremium(root, PHONE, 36 * 60, reglas, ahora + 29 * HORA)
  assert.equal(estadoPremium(root, PHONE, { ...reglas, maxHours: 48 }, ahora + 29 * HORA).puedeSumar, true)
  assert.equal(estadoPremium(root, PHONE, { ...reglas, maxHours: 12 }, ahora + 29 * HORA).bloqueado, true)
})

test('premium: si el desbloqueo es cero, espera al vencimiento y después permite empezar otro ciclo', t => {
  const root = escenario(t)
  const ahora = Date.now()
  const reglas = { ...ajustes, unlockHours: 0 }
  sumarPremium(root, PHONE, 24 * 60, reglas, ahora)
  assert.equal(estadoPremium(root, PHONE, reglas, ahora + 24 * HORA - 1).bloqueado, true)
  assert.equal(estadoPremium(root, PHONE, reglas, ahora + 24 * HORA).puedeSumar, true)
  assert.equal(sumarPremium(root, PHONE, 60, reglas, ahora + 24 * HORA).puedeSumar, true)
})
