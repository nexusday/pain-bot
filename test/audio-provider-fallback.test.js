import test from 'node:test'
import assert from 'node:assert/strict'
import { probarProveedoresAudio } from '../lib/audio-provider-fallback.js'

test('tries the next audio provider when the first returns no audio', async () => {
  const intentos = []
  const audio = await probarProveedoresAudio([
    { nombre: 'primero', obtener: async () => { intentos.push('primero'); return null } },
    { nombre: 'segundo', obtener: async () => { intentos.push('segundo'); return { urlAudio: 'https://audio.test/file.mp3' } } }
  ])

  assert.deepEqual(intentos, ['primero', 'segundo'])
  assert.equal(audio.urlAudio, 'https://audio.test/file.mp3')
})

test('continues to the next audio provider when the first throws', async () => {
  const errores = []
  const audio = await probarProveedoresAudio([
    { nombre: 'primero', obtener: async () => { throw new Error('provider unavailable') } },
    { nombre: 'segundo', obtener: async () => ({ urlAudio: 'https://audio.test/file.mp3' }) }
  ], (provider, error) => errores.push([provider, error.message]))

  assert.equal(audio.urlAudio, 'https://audio.test/file.mp3')
  assert.deepEqual(errores, [['primero', 'provider unavailable']])
})

test('returns null only after every provider fails', async () => {
  const audio = await probarProveedoresAudio([
    { nombre: 'primero', obtener: async () => null },
    { nombre: 'segundo', obtener: async () => ({ datos: {} }) }
  ])

  assert.equal(audio, null)
})
