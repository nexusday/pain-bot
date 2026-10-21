import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cargarEnv, parseEnv } from '../lib/load-env.js'

test('env loader: parsea claves, comillas y comentarios', () => {
  const datos = parseEnv(`
# comentario
SIMPLE=valor
export EXPORTADA=otro
CON_ESPACIOS = "hola mundo"
CON_SALTO="linea 1\\nlinea 2"
COMILLA_SIMPLE='texto # literal'
SIN_COMILLAS=valor # comentario final
INVALIDA
1NO_VALIDA=no
`)
  assert.deepEqual(datos, {
    SIMPLE: 'valor',
    EXPORTADA: 'otro',
    CON_ESPACIOS: 'hola mundo',
    CON_SALTO: 'linea 1\nlinea 2',
    COMILLA_SIMPLE: 'texto # literal',
    SIN_COMILLAS: 'valor',
  })
})

test('env loader: no pisa variables reales del proceso', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-env-'))
  const archivo = path.join(dir, '.env')
  const claveA = 'PAIN_TEST_ENV_LOADER_A'
  const claveB = 'PAIN_TEST_ENV_LOADER_B'
  const anteriorB = process.env[claveB]
  try {
    fs.writeFileSync(archivo, `${claveA}=desde-archivo\n${claveB}=desde-archivo\n`)
    process.env[claveB] = 'desde-entorno'
    const cargadas = cargarEnv(archivo)
    assert.equal(process.env[claveA], 'desde-archivo')
    assert.equal(process.env[claveB], 'desde-entorno')
    assert.equal(cargadas[claveA], 'desde-archivo')
    assert.equal(cargadas[claveB], undefined)
  } finally {
    delete process.env[claveA]
    if (anteriorB === undefined) delete process.env[claveB]
    else process.env[claveB] = anteriorB
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('env loader: se puede desactivar explícitamente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-env-off-'))
  const archivo = path.join(dir, '.env')
  const clave = 'PAIN_TEST_ENV_LOADER_OFF'
  const anterior = process.env.PAIN_SKIP_DOTENV
  try {
    fs.writeFileSync(archivo, `${clave}=no-deberia-cargarse\n`)
    process.env.PAIN_SKIP_DOTENV = '1'
    const cargadas = cargarEnv(archivo)
    assert.equal(process.env[clave], undefined)
    assert.deepEqual(cargadas, {})
  } finally {
    delete process.env[clave]
    if (anterior === undefined) delete process.env.PAIN_SKIP_DOTENV
    else process.env.PAIN_SKIP_DOTENV = anterior
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
