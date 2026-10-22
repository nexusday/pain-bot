import assert from 'node:assert/strict'
import test from 'node:test'
import { recortarParaMemoria, construirContextoMemoria } from '../lib/geminiAPI.js'

test('ia-memoria: recorta los mensajes largos al guardarlos', () => {
  const corto = 'hola qué tal'
  assert.equal(recortarParaMemoria(corto), corto)

  const largo = 'a'.repeat(5000)
  const recortado = recortarParaMemoria(largo)
  assert.ok(recortado.length <= 200, `debe quedar como mucho 200 chars, quedo ${recortado.length}`)
  assert.ok(recortado.startsWith('aaa'))
})

test('ia-memoria: el contexto no crece sin limite con muchas respuestas', () => {
  const memoria = []
  for (let i = 0; i < 40; i++) {
    memoria.push({
      sender: 'alguien',
      message: 'x'.repeat(400),
      timestamp: '03:12',
      date: '21/10/2026',
      isBot: true
    })
  }

  const contexto = construirContextoMemoria(memoria, 'Historial reciente del grupo')
  assert.ok(contexto.length <= 1000, `contexto demasiado grande: ${contexto.length}`)
  // como mucho 6 mensajes (los ultimos)
  const lineas = contexto.trim().split('\n').slice(1)
  assert.ok(lineas.length <= 6, `debe usar maximo 6 mensajes, uso ${lineas.length}`)
})

test('ia-memoria: contexto vacio sin memoria', () => {
  assert.equal(construirContextoMemoria([], 'Historial'), '')
  assert.equal(construirContextoMemoria(null, 'Historial'), '')
})
