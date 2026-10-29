import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analizarHora,
  crearHorario,
  horarioEstaAbierto,
  resolverZona,
  siguienteCambio,
} from '../lib/group-auto-hours.js'

test('rab: interpreta zonas y horas de 12/24 horas', () => {
  assert.equal(resolverZona('perú'), 'America/Lima')
  assert.equal(resolverZona('gm'), 'UTC')
  assert.equal(analizarHora('12:00 am').total, 0)
  assert.equal(analizarHora('12:00 pm').total, 720)
  assert.equal(analizarHora('22:30').total, 1350)
})

test('rab: abre y cierra en horario normal', () => {
  const horario = crearHorario('peru', '8:00 am', '10:00 pm')
  assert.equal(horarioEstaAbierto(horario, 8 * 60), true)
  assert.equal(horarioEstaAbierto(horario, 21 * 60 + 59), true)
  assert.equal(horarioEstaAbierto(horario, 22 * 60), false)
  assert.deepEqual(siguienteCambio(horario, 9 * 60), { abierto: true, hora: '22:00', tipo: 'cierre' })
})

test('rab: admite horarios que cruzan medianoche y rechaza errores', () => {
  const horario = crearHorario('gmt', '10:00 pm', '8:00 am')
  assert.equal(horarioEstaAbierto(horario, 23 * 60), true)
  assert.equal(horarioEstaAbierto(horario, 7 * 60 + 59), true)
  assert.equal(horarioEstaAbierto(horario, 8 * 60), false)
  assert.throws(() => crearHorario('peru', '8:00', '8:00'), /iguales/)
  assert.throws(() => crearHorario('inventado', '8:00', '9:00'), /Zona horaria/)
})
