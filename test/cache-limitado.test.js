import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarEnCacheLimitado } from '../lib/cache-limitado.js'

test('guarda el valor y respeta el tope de claves', () => {
  const mapa = new Map()
  for (let indice = 0; indice < 10; indice++) {
    guardarEnCacheLimitado(mapa, `k${indice}`, indice, 4)
  }
  assert.equal(mapa.size, 4)
  assert.equal(mapa.get('k9'), 9)
  assert.equal(mapa.has('k0'), false)
})

test('renueva la posición de una clave repetida', () => {
  const mapa = new Map()
  guardarEnCacheLimitado(mapa, 'a', 1, 2)
  guardarEnCacheLimitado(mapa, 'b', 2, 2)
  guardarEnCacheLimitado(mapa, 'a', 3, 2)
  guardarEnCacheLimitado(mapa, 'c', 4, 2)

  assert.equal(mapa.size, 2)
  assert.equal(mapa.get('a'), 3)
  assert.equal(mapa.has('b'), false)
  assert.equal(mapa.get('c'), 4)
})

test('sin tope no descarta nada', () => {
  const mapa = new Map()
  for (let indice = 0; indice < 50; indice++) {
    guardarEnCacheLimitado(mapa, `k${indice}`, indice, 0)
  }
  assert.equal(mapa.size, 50)
})
