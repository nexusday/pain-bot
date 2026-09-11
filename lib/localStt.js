import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync } from 'fs'

process.env.ORT_LOGGING_LEVEL = '3'

const execAsync = promisify(exec)

const MODELOS_WHISPER = [
  'Xenova/whisper-base',
  'Xenova/whisper-tiny'
]
const TASA_MUESTREO = 16000
const DURACION_MAX_SEG = 60
const MAX_SEG_UN_CHUNK = 28

const MAPA_IDIOMAS = {
  es: 'spanish',
  spa: 'spanish',
  en: 'english',
  eng: 'english',
  pt: 'portuguese',
  por: 'portuguese',
  fr: 'french',
  fra: 'french',
  de: 'german',
  it: 'italian'
}

const PATRONES_ALUCINACION = [
  /\bsubtitulado por\b.*$/gi,
  /\bsubtítulos realizados por\b.*$/gi,
  /\bgracias por ver\b.*$/gi,
  /\bthanks for watching\b.*$/gi,
  /\bthank you for watching\b.*$/gi,
  /\b\[música\]/gi,
  /\b\(música\)/gi,
  /\b\[music\]/gi,
  /\b\(music\)/gi,
  /\b¡gracias!?\b/gi,
  /\bgracias\.?\s*$/gi
]

let promesaTranscriptor = null
let idModeloActivo = ''
let colaTranscripcion = Promise.resolve()

function normalizarIdioma(codigo) {
  if (!codigo) return null
  const crudo = String(codigo).toLowerCase().trim()
  return MAPA_IDIOMAS[crudo] || MAPA_IDIOMAS[crudo.slice(0, 2)] || null
}

export function obtenerDuracionMaxAudio() {
  return DURACION_MAX_SEG
}

export async function obtenerDuracionAudioSegundos(rutaArchivo) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rutaArchivo}"`
  )
  const valor = parseFloat(String(stdout || '').trim())
  return Number.isFinite(valor) ? valor : 0
}

export async function convertirAudioAWav(rutaEntrada, rutaSalida) {
  await execAsync(
    `ffmpeg -y -i "${rutaEntrada}" -af "highpass=f=80,lowpass=f=7500,dynaudnorm" -ar ${TASA_MUESTREO} -ac 1 -c:a pcm_s16le "${rutaSalida}"`
  )
}

function leerWavComoFloat32(rutaArchivo) {
  const buf = readFileSync(rutaArchivo)
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Archivo WAV inválido')
  }

  const vista = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 12
  let bitsPorMuestra = 16
  let inicioDatos = 0
  let tamanoDatos = 0

  while (offset + 8 <= buf.length) {
    const idChunk = buf.toString('ascii', offset, offset + 4)
    const tamanoChunk = vista.getUint32(offset + 4, true)
    offset += 8

    if (idChunk === 'fmt ') {
      bitsPorMuestra = vista.getUint16(offset + 14, true)
    } else if (idChunk === 'data') {
      inicioDatos = offset
      tamanoDatos = tamanoChunk
      break
    }

    offset += tamanoChunk + (tamanoChunk % 2)
  }

  if (!inicioDatos || bitsPorMuestra !== 16) {
    throw new Error('WAV debe ser PCM 16-bit mono')
  }

  const cantidadMuestras = Math.floor(tamanoDatos / 2)
  const audio = new Float32Array(cantidadMuestras)

  for (let i = 0; i < cantidadMuestras; i++) {
    audio[i] = vista.getInt16(inicioDatos + i * 2, true) / 32768
  }

  return recortarSilencio(audio)
}

function recortarSilencio(audio, umbral = 0.008) {
  if (!audio?.length) return audio

  let inicio = 0
  let fin = audio.length - 1

  while (inicio < fin && Math.abs(audio[inicio]) < umbral) inicio++
  while (fin > inicio && Math.abs(audio[fin]) < umbral) fin--

  const relleno = Math.floor(TASA_MUESTREO * 0.08)
  inicio = Math.max(0, inicio - relleno)
  fin = Math.min(audio.length - 1, fin + relleno)

  if (fin <= inicio) return audio
  return audio.subarray(inicio, fin + 1)
}

function construirOpcionesTranscripcion(duracionSeg, language) {
  const opciones = {
    task: 'transcribe',
    return_timestamps: false
  }

  const idioma = normalizarIdioma(language)
  if (idioma) opciones.language = idioma

  if (duracionSeg > MAX_SEG_UN_CHUNK) {
    opciones.chunk_length_s = 30
    opciones.stride_length_s = 1
  } else {
    opciones.chunk_length_s = 0
  }

  return opciones
}

function deduplicarFrasesConsecutivas(texto) {
  const palabras = texto.split(' ')
  if (palabras.length < 4) return texto

  for (let len = Math.floor(palabras.length / 2); len >= 3; len--) {
    const primera = palabras.slice(0, len).join(' ')
    const segunda = palabras.slice(len, len * 2).join(' ')
    if (primera.toLowerCase() === segunda.toLowerCase()) {
      return palabras.slice(0, len).join(' ')
    }
  }

  const salida = []
  let i = 0

  while (i < palabras.length) {
    let omitido = false

    for (let tamano = Math.min(10, Math.floor((palabras.length - i) / 2)); tamano >= 3; tamano--) {
      const a = palabras.slice(i, i + tamano).join(' ').toLowerCase()
      const b = palabras.slice(i + tamano, i + tamano * 2).join(' ').toLowerCase()
      if (a === b) {
        salida.push(...palabras.slice(i, i + tamano))
        i += tamano * 2
        omitido = true
        break
      }
    }

    if (!omitido) {
      salida.push(palabras[i])
      i++
    }
  }

  return salida.join(' ')
}

function limpiarTranscripcion(texto) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''

  for (const patron of PATRONES_ALUCINACION) {
    t = t.replace(patron, '').trim()
  }

  const oraciones = t.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
  const oracionesUnicas = []

  for (const oracion of oraciones) {
    const norm = oracion.toLowerCase()
    const prev = oracionesUnicas[oracionesUnicas.length - 1]
    if (!prev || prev.toLowerCase() !== norm) oracionesUnicas.push(oracion)
  }

  t = oracionesUnicas.join(' ').trim()
  t = deduplicarFrasesConsecutivas(t)

  return t.replace(/\s+([,.;:!?])/g, '$1').trim()
}

async function crearPipelineWhisper(modelId) {
  const {
    AutomaticSpeechRecognitionPipeline,
    AutoProcessor,
    AutoTokenizer,
    WhisperForConditionalGeneration,
    env
  } = await import('@xenova/transformers')

  env.allowLocalModels = true
  env.useBrowserCache = false

  const opts = { quantized: true }
  const [model, processor, tokenizer] = await Promise.all([
    WhisperForConditionalGeneration.from_pretrained(modelId, opts),
    AutoProcessor.from_pretrained(modelId, opts),
    AutoTokenizer.from_pretrained(modelId, opts)
  ])

  return new AutomaticSpeechRecognitionPipeline({
    task: 'automatic-speech-recognition',
    model,
    processor,
    tokenizer
  })
}

async function cargarTranscriptor() {
  if (!promesaTranscriptor) {
    promesaTranscriptor = (async () => {
      let ultimoError = null

      for (const modelId of MODELOS_WHISPER) {
        try {
          console.log(`[stt] Cargando ${modelId}...`)
          const pipe = await crearPipelineWhisper(modelId)
          idModeloActivo = modelId
          console.log(`[stt] Modelo listo: ${modelId}`)
          return pipe
        } catch (error) {
          ultimoError = error
          console.warn(`[stt] No se pudo cargar ${modelId}:`, error?.message || error)
        }
      }

      throw ultimoError || new Error('No se pudo cargar ningún modelo Whisper local')
    })()
  }
  return promesaTranscriptor
}

export function obtenerModeloSttActivo() {
  return idModeloActivo
}

export async function transcribirArchivoWav(rutaWav, language = null, durationSec = 0) {
  const ejecutar = async () => {
    const transcriptor = await cargarTranscriptor()
    const datosAudio = leerWavComoFloat32(rutaWav)

    if (!datosAudio?.length) return ''

    const duracion = durationSec || datosAudio.length / TASA_MUESTREO
    const opciones = construirOpcionesTranscripcion(duracion, language)
    const resultado = await transcriptor(datosAudio, opciones)

    return limpiarTranscripcion(resultado?.text || '')
  }

  const trabajo = colaTranscripcion.then(ejecutar, ejecutar)
  colaTranscripcion = trabajo.catch(() => {})
  return trabajo
}

export async function calentarModeloStt() {
  await cargarTranscriptor()
}

export {
  obtenerDuracionMaxAudio as getMaxAudioDuration,
  obtenerDuracionAudioSegundos as getAudioDurationSeconds,
  convertirAudioAWav as convertAudioToWav,
  obtenerModeloSttActivo as getActiveSttModel,
  transcribirArchivoWav as transcribeWavFile,
  calentarModeloStt as warmupSttModel
}
