import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularEsperaReconexion, MOTIVOS_LIMITE } from '../lib/reconnect-backoff.js'

test('reconnect-backoff: 428/408/503 esperan más y crecen exponencialmente', () => {
  for (const motivo of [428, 408, 503]) {
    assert.ok(MOTIVOS_LIMITE.has(motivo))
    const primero = calcularEsperaReconexion({ motivo, random: () => 0 })
    assert.equal(primero.tipo, 'rate')
    assert.equal(primero.fallos, 1)
    assert.equal(primero.reemplazos, 0)
    assert.equal(primero.esperaMs, 15_000)

    const segundo = calcularEsperaReconexion({ motivo, fallos: primero.fallos, random: () => 0 })
    assert.equal(segundo.esperaMs, 30_000)

    const tercero = calcularEsperaReconexion({ motivo, fallos: segundo.fallos, random: () => 0 })
    assert.equal(tercero.esperaMs, 60_000)

    const tope = calcularEsperaReconexion({ motivo, fallos: 20, random: () => 0 })
    assert.equal(tope.esperaMs, 60_000)
  }
})

test('reconnect-backoff: cortes normales empiezan en 3 s y se topan en 45 s', () => {
  const primero = calcularEsperaReconexion({ motivo: 500, random: () => 0 })
  assert.equal(primero.tipo, 'transient')
  assert.equal(primero.esperaMs, 3_000)

  const segundo = calcularEsperaReconexion({ motivo: 500, fallos: 1, random: () => 0 })
  assert.equal(segundo.esperaMs, 6_000)

  const cupo = calcularEsperaReconexion({ motivo: undefined, fallos: 8, random: () => 0 })
  assert.equal(cupo.esperaMs, 45_000, '9 fallos: 3 s × 2^5 = 96 s, limitado a 45 s')

  const muchos = calcularEsperaReconexion({ motivo: 500, fallos: 9, random: () => 0 })
  assert.equal(muchos.esperaMs, 60_000, 'al llegar a 10 fallos se espera un minuto')
})

test('reconnect-backoff: 515 es rápido; 440 crece aparte y la dispersión se limita', () => {
  const reinicio = calcularEsperaReconexion({ motivo: 515, fallos: 4, random: () => 0 })
  assert.equal(reinicio.tipo, 'restart')
  assert.equal(reinicio.esperaMs, 300)
  assert.equal(reinicio.fallos, 4, 'un reinicio pedido por el servidor no cuenta como fallo')

  const reemplazo1 = calcularEsperaReconexion({ motivo: 440, random: () => 0 })
  assert.equal(reemplazo1.tipo, 'replaced')
  assert.equal(reemplazo1.esperaMs, 10_000)
  assert.equal(reemplazo1.reemplazos, 1)
  assert.equal(reemplazo1.fallos, 0)

  const reemplazo2 = calcularEsperaReconexion({ motivo: 440, reemplazos: 1, random: () => 0 })
  assert.equal(reemplazo2.esperaMs, 20_000)

  const conAzar = calcularEsperaReconexion({ motivo: 428, random: () => 0.5 })
  assert.equal(conAzar.esperaMs, 17_500, '15 s + hasta 5 s de dispersión')

  const azarMaximo = calcularEsperaReconexion({ motivo: 428, random: () => 1 })
  assert.equal(azarMaximo.esperaMs, 19_999, 'Math.random nunca llega a 1, pero se acota igual')
})
