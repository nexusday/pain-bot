import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  eliminarMetricasVivo,
  leerMetricasVivo,
  leerMetricasVivoSync,
  publicarMetricasVivo,
} from '../lib/worker-live-metrics.js'

test('worker-live-metrics: publica, lee, descarta viejas y elimina', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-live-metrics-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  assert.equal(await publicarMetricasVivo(dir, '../invalido', { lagP99Ms: 1 }), false)
  assert.equal(await publicarMetricasVivo(dir, 'server-1-lane-2', {
    lagP99Ms: 123,
    cpuUsoPercent: 45.5,
    uptimeSegundos: 600,
    totalSesiones: 10,
    sesionesConectadas: 9,
    desconexiones428: 2,
    reintentosReconexion: 3,
  }), true)

  const frescas = await leerMetricasVivo(dir)
  assert.equal(frescas.size, 1)
  const muestra = frescas.get('server-1-lane-2')
  assert.equal(muestra.lagP99Ms, 123)
  assert.equal(muestra.cpuUsoPercent, 45.5)
  assert.equal(muestra.totalSesiones, 10)
  assert.equal(muestra.sesionesConectadas, 9)
  assert.ok(muestra.actualizadoEn > 0)

  const viejas = await leerMetricasVivo(dir, { now: Date.now() + 20_000 })
  assert.equal(viejas.size, 0, 'las muestras de más de 15 s no se usan')

  const sync = leerMetricasVivoSync(dir)
  assert.equal(sync.size, 1)

  await eliminarMetricasVivo(dir, 'server-1-lane-2')
  assert.equal((await leerMetricasVivo(dir)).size, 0)
})
