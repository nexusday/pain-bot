import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

// Libera el histograma del event loop antes de que termine el runner.
after(() => finalizarMetricasWorker())

import {
  invalidarMetadataGrupo,
  metadataGrupo,
  registrarMetadata,
} from '../lib/group-meta-cache.js'
import {
  contarMensajesDuplicados,
  contarMensajesRecibidos,
  contarReintentoReconexion,
  contarReconexionTerminada,
  finalizarMetricasWorker,
  iniciarMetricasWorker,
  persistirMetrica,
  registrarMetricasWorker,
} from '../lib/worker-metrics.js'

function socketFalso(consultas, { demoraMs = 0 } = {}) {  return {
    decodeJid: (id) => String(id),
    groupMetadata(jid) {
      consultas.push(jid)
      return new Promise((resolver) => setTimeout(() => resolver({
        id: jid,
        subject: `grupo-${jid}`,
        participants: [{ id: '573001112233@s.whatsapp.net' }],
      }), demoraMs))
    },
  }
}

test('metadataGrupo deduplica consultas simultáneas del mismo grupo', async () => {
  invalidarMetadataGrupo('120363@g.us')
  const consultas = []
  const conn = socketFalso(consultas, { demoraMs: 40 })
  const [a, b, c] = await Promise.all([
    metadataGrupo(conn, '120363@g.us', { esperar: true }),
    metadataGrupo(conn, '120363@g.us', { esperar: true }),
    metadataGrupo(conn, '120363@g.us', { esperar: true }),
  ])
  assert.equal(consultas.length, 1, 'una sola consulta a WhatsApp')
  assert.equal(a.subject, 'grupo-120363@g.us')
  assert.equal(b.subject, a.subject)
  assert.equal(c.subject, a.subject)
  // Con caché, siguientes llamadas ni siquiera consultan.
  await metadataGrupo(conn, '120363@g.us')
  assert.equal(consultas.length, 1)
})

test('metadataGrupo del camino caliente devuelve fallback si la consulta cuelga', async () => {
  process.env.PAIN_META_FETCH_MAX_MS = '2000'
  invalidarMetadataGrupo('1203632@g.us')
  const conn = {
    decodeJid: (id) => String(id),
    chats: {},
    groupMetadata() {
      return new Promise(() => {}) // nunca responde
    },
  }
  const inicio = Date.now()
  const resultado = await metadataGrupo(conn, '1203632@g.us')
  const tardo = Date.now() - inicio
  assert.equal(resultado, null)
  assert.ok(tardo >= 1500, `espera el tope configurado; tardó ${tardo}ms`)
  assert.ok(tardo < 3500, 'no debe esperar el timeout completo de Baileys')
})

test('esperar:true comparte el dedup aunque la consulta compartida sea lenta', async () => {
  invalidarMetadataGrupo('1203633@g.us')
  const consultas = []
  const conn = {
    decodeJid: (id) => String(id),
    groupMetadata(jid) {
      consultas.push(jid)
      // Consulta lenta pero determinada: caliente y esperar convergen juntas.
      return new Promise((resolver) => setTimeout(() => resolver({
        id: jid,
        subject: `grupo-${jid}`,
        participants: [{ id: '573001112233@s.whatsapp.net' }],
      }), 1200))
    },
  }
  process.env.PAIN_META_FETCH_MAX_MS = '3000'
  const caliente = metadataGrupo(conn, '1203633@g.us')
  // Este llega mientras la primera consulta sigue en curso: no dispara otra.
  const esperada = metadataGrupo(conn, '1203633@g.us', { esperar: true })
  const [a, b] = await Promise.all([caliente, esperada])
  assert.equal(consultas.length, 1)
  assert.equal(a.subject, 'grupo-1203633@g.us')
  assert.equal(b.subject, a.subject)
})

test('las métricas del worker cuentan y persisten una línea JSONL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-metrics-'))
  try {
    iniciarMetricasWorker()
    contarMensajesRecibidos(5, 4)
    contarMensajesDuplicados(1)
    contarReintentoReconexion(428)
    contarReintentoReconexion(515)
    contarReconexionTerminada()
    const muestra = registrarMetricasWorker()
    assert.equal(muestra.mensajesRecibidos, 5)
    assert.equal(muestra.mensajesEntregados, 4)
    assert.equal(muestra.mensajesDuplicados, 1)
    assert.equal(muestra.reintentosReconexion, 2)
    assert.equal(muestra.desconexiones428, 1)
    assert.equal(muestra.reconexionesTerminadas, 1)
    assert.ok(Number.isFinite(muestra.cpuUsoPercent))
    assert.ok(muestra.uptimeSegundos >= 0)
    if (muestra.lagMuestras === 0) {
      assert.equal(muestra.lagMediaMs, 0)
      assert.equal(muestra.lagP99Ms, 0)
    }
    await persistirMetrica('subbot-group-9', root, muestra)
    const archivo = fs.readdirSync(path.join(root, 'storage', 'metrics'))[0]
    assert.match(archivo, /^subbot-group-9-\d{4}-\d{2}-\d{2}\.jsonl$/)
    const lineas = fs.readFileSync(path.join(root, 'storage', 'metrics', archivo), 'utf8').trim().split('\n')
    assert.equal(lineas.length, 1)
    const linea = JSON.parse(lineas[0])
    assert.equal(linea.mensajesRecibidos, 5)
    assert.ok(Number.isFinite(linea.t))
    // IDs inválidos no crean archivos nuevos.
    await persistirMetrica('../malo', root, muestra)
    assert.equal(fs.readdirSync(path.join(root, 'storage', 'metrics')).length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('lag del event loop se mide y se resetea por muestreo', async () => {
  iniciarMetricasWorker()
  // Generar algo de ocupación para que el histograma registre muestras.
  const ocupado = Date.now() + 5
  while (Date.now() < ocupado) Math.sqrt(Math.random())
  const muestra = registrarMetricasWorker()
  assert.ok(muestra.lagMaxMs >= 0, `lag max no negativo: ${muestra.lagMaxMs}`)
  assert.ok(muestra.lagP99Ms <= muestra.lagMaxMs)
  const siguiente = registrarMetricasWorker()
  assert.equal(siguiente.lagMuestras, 0, 'el histograma se resetea por muestreo')
})
