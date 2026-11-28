import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agruparRendimientoPorServidor,
  calcularRendimiento,
  claveDeWorker,
} from '../lib/webpanel/server-performance.js'

test('server-performance: claveDeWorker reconoce carriles de servidor y automáticos', () => {
  assert.equal(claveDeWorker('server-3-lane-7'), '3')
  assert.equal(claveDeWorker('server-12-lane-0'), '12')
  assert.equal(claveDeWorker('worker-2'), 'auto')
  assert.equal(claveDeWorker('primary'), 'auto')
  assert.equal(claveDeWorker('otro-proceso'), null)
  assert.equal(claveDeWorker(undefined), null)
})

test('server-performance: agrupa p99, CPU, uptime y 428 por servidor', () => {
  const workers = [
    {
      workerId: 'server-1-lane-0',
      metricas: { lagP99Ms: 120, cpuUsoPercent: 40, uptimeSegundos: 3600, desconexiones428: 0, reintentosReconexion: 1 },
      sessions: [{ connected: true }, { connected: true }, { connected: false }],
    },
    {
      workerId: 'server-1-lane-1',
      metricas: { lagP99Ms: 900, cpuUsoPercent: 95, uptimeSegundos: 1200, desconexiones428: 2, reintentosReconexion: 5 },
      sessions: [{ connected: true }, { connected: false }],
    },
    {
      workerId: 'server-2-lane-3',
      metricas: { lagP99Ms: 80, cpuUsoPercent: 20, uptimeSegundos: 500, desconexiones428: 0, reintentosReconexion: 0 },
      sessions: [{ connected: true }, { connected: true }],
    },
    {
      workerId: 'worker-5',
      metricas: { lagP99Ms: 200, cpuUsoPercent: 30, uptimeSegundos: 900 },
      sessions: [{ connected: true }],
    },
    // Los workers sin métricas (sintéticos), los IDs desconocidos y los
    // carriles sin sesiones (panel/primario) no cuentan.
    { workerId: 'server-2-lane-9', sessions: [{ connected: true }] },
    { workerId: 'server-2-lane-10', metricas: { lagP99Ms: 5000, cpuUsoPercent: 99 }, sessions: [] },
    { workerId: 'proceso-raro', metricas: { lagP99Ms: 5000 }, sessions: [{ connected: true }] },
  ]

  const mapa = agruparRendimientoPorServidor(workers)
  assert.equal(mapa.size, 3)

  const servidor1 = mapa.get('1')
  assert.equal(servidor1.lanes, 2)
  assert.equal(servidor1.total, 5)
  assert.equal(servidor1.connected, 3)
  assert.equal(Math.max(...servidor1.p99), 900)
  assert.equal(Math.max(...servidor1.cpu), 95)
  assert.equal(Math.min(...servidor1.uptime), 1200)
  assert.equal(servidor1.desconexiones428, 2)
  assert.equal(servidor1.reintentos, 6)

  const servidor2 = mapa.get('2')
  assert.equal(servidor2.lanes, 1, 'el worker sin métricas no debe agregarse')
  assert.equal(servidor2.total, 2)

  assert.equal(mapa.get('auto').lanes, 1)
})

test('server-performance: usa los totales en vivo y no cuenta sesiones inexistentes', () => {
  const mapa = agruparRendimientoPorServidor([
    {
      workerId: 'server-4-lane-2',
      metricas: {
        lagP99Ms: 250, cpuUsoPercent: 55, uptimeSegundos: 100,
        totalSesiones: 12, sesionesConectadas: 20,
        desconexiones428: 1, reintentosReconexion: 2,
      },
      sessions: [],
    },
    {
      workerId: 'server-4-lane-3',
      metricas: {
        lagP99Ms: 50, cpuUsoPercent: 10, uptimeSegundos: 50,
        totalSesiones: 3, sesionesConectadas: 1,
      },
      sessions: [],
    },
  ])
  const servidor4 = mapa.get('4')
  assert.equal(servidor4.total, 15)
  assert.equal(servidor4.connected, 13, 'las conectadas nunca superan el total')
  assert.equal(servidor4.lanes, 2)
  assert.equal(servidor4.desconexiones428, 1)
})

test('server-performance: calcula la nota con el peor carril y detecta caídas 428', () => {
  const servidor1 = calcularRendimiento({
    p99: [120, 900],
    cpu: [40, 95],
    uptime: [3600, 1200],
    total: 5,
    connected: 3,
    lanes: 2,
    desconexiones428: 2,
    reintentos: 6,
  })
  assert.equal(servidor1.p99Ms, 900)
  assert.equal(servidor1.cpuPercent, 95)
  assert.equal(servidor1.uptimeSegundos, 1200)
  assert.equal(servidor1.score, 38)
  assert.equal(servidor1.label, 'Lenta')
  assert.equal(servidor1.speed, 'Lento')
  assert.equal(servidor1.desconexiones428, 2)
  assert.equal(servidor1.reintentos, 6)

  const sano = calcularRendimiento({
    p99: [80],
    cpu: [20],
    uptime: [500],
    total: 4,
    connected: 4,
    lanes: 1,
    desconexiones428: 0,
    reintentos: 0,
  })
  assert.equal(sano.score, 100)
  assert.equal(sano.label, 'Excelente')
  assert.equal(sano.speed, 'Rápido')

  const automatico = calcularRendimiento({
    p99: [200],
    cpu: [30],
    uptime: [900],
    total: 1,
    connected: 1,
    lanes: 1,
    desconexiones428: 0,
    reintentos: 0,
  })
  assert.equal(automatico.score, 97)
  assert.equal(automatico.speed, 'Normal')

  assert.equal(calcularRendimiento(null), null)
  assert.equal(calcularRendimiento({}), null)
  assert.equal(calcularRendimiento({ lanes: 0 }), null)
})

test('server-performance: marca la muestra como stale sin borrar el rendimiento', () => {
  const ahora = Date.now()
  const base = {
    p99: [120], cpu: [20], uptime: [600], total: 8, connected: 8, lanes: 1,
    desconexiones428: 0, reintentos: 0,
  }
  const fresca = calcularRendimiento({ ...base, actualizadoEn: [ahora - 5_000] }, { now: ahora })
  assert.equal(fresca.stale, false)
  assert.equal(fresca.score, 97)

  const vieja = calcularRendimiento({ ...base, actualizadoEn: [ahora - 40_000] }, { now: ahora })
  assert.equal(vieja.stale, true, 'la muestra vieja se conserva pero se marca')
  assert.equal(vieja.score, 97)
  assert.ok(vieja.actualizadoEn > 0)
})
