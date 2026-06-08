import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync } from 'fs'

process.env.ORT_LOGGING_LEVEL = '3'

const execAsync = promisify(exec)

const WHISPER_MODELS = [
  'Xenova/whisper-base',
  'Xenova/whisper-tiny'
]
const SAMPLE_RATE = 16000
const MAX_DURATION_SEC = 60
const SINGLE_CHUNK_MAX_SEC = 28

const LANG_MAP = {
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

const HALLUCINATION_PATTERNS = [
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

let transcriberPromise = null
let activeModelId = ''
let transcribeQueue = Promise.resolve()

function normalizeLanguage(code) {
  if (!code) return null
  const raw = String(code).toLowerCase().trim()
  return LANG_MAP[raw] || LANG_MAP[raw.slice(0, 2)] || null
}

export function getMaxAudioDuration() {
  return MAX_DURATION_SEC
}

export async function getAudioDurationSeconds(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  )
  const value = parseFloat(String(stdout || '').trim())
  return Number.isFinite(value) ? value : 0
}

export async function convertAudioToWav(inputPath, outputPath) {
  await execAsync(
    `ffmpeg -y -i "${inputPath}" -af "highpass=f=80,lowpass=f=7500,dynaudnorm" -ar ${SAMPLE_RATE} -ac 1 -c:a pcm_s16le "${outputPath}"`
  )
}

function readWavAsFloat32(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Archivo WAV inválido')
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 12
  let bitsPerSample = 16
  let dataStart = 0
  let dataSize = 0

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = view.getUint32(offset + 4, true)
    offset += 8

    if (chunkId === 'fmt ') {
      bitsPerSample = view.getUint16(offset + 14, true)
    } else if (chunkId === 'data') {
      dataStart = offset
      dataSize = chunkSize
      break
    }

    offset += chunkSize + (chunkSize % 2)
  }

  if (!dataStart || bitsPerSample !== 16) {
    throw new Error('WAV debe ser PCM 16-bit mono')
  }

  const sampleCount = Math.floor(dataSize / 2)
  const audio = new Float32Array(sampleCount)

  for (let i = 0; i < sampleCount; i++) {
    audio[i] = view.getInt16(dataStart + i * 2, true) / 32768
  }

  return trimSilence(audio)
}

function trimSilence(audio, threshold = 0.008) {
  if (!audio?.length) return audio

  let start = 0
  let end = audio.length - 1

  while (start < end && Math.abs(audio[start]) < threshold) start++
  while (end > start && Math.abs(audio[end]) < threshold) end--

  const pad = Math.floor(SAMPLE_RATE * 0.08)
  start = Math.max(0, start - pad)
  end = Math.min(audio.length - 1, end + pad)

  if (end <= start) return audio
  return audio.subarray(start, end + 1)
}

function buildTranscribeOptions(durationSec, language) {
  const options = {
    task: 'transcribe',
    return_timestamps: false
  }

  const lang = normalizeLanguage(language)
  if (lang) options.language = lang

  if (durationSec > SINGLE_CHUNK_MAX_SEC) {
    options.chunk_length_s = 30
    options.stride_length_s = 1
  } else {
    options.chunk_length_s = 0
  }

  return options
}

function dedupeConsecutivePhrases(text) {
  const words = text.split(' ')
  if (words.length < 4) return text

  for (let len = Math.floor(words.length / 2); len >= 3; len--) {
    const first = words.slice(0, len).join(' ')
    const second = words.slice(len, len * 2).join(' ')
    if (first.toLowerCase() === second.toLowerCase()) {
      return words.slice(0, len).join(' ')
    }
  }

  const out = []
  let i = 0

  while (i < words.length) {
    let skipped = false

    for (let size = Math.min(10, Math.floor((words.length - i) / 2)); size >= 3; size--) {
      const a = words.slice(i, i + size).join(' ').toLowerCase()
      const b = words.slice(i + size, i + size * 2).join(' ').toLowerCase()
      if (a === b) {
        out.push(...words.slice(i, i + size))
        i += size * 2
        skipped = true
        break
      }
    }

    if (!skipped) {
      out.push(words[i])
      i++
    }
  }

  return out.join(' ')
}

function cleanTranscription(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''

  for (const pattern of HALLUCINATION_PATTERNS) {
    t = t.replace(pattern, '').trim()
  }

  const sentences = t.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
  const uniqueSentences = []

  for (const sentence of sentences) {
    const norm = sentence.toLowerCase()
    const prev = uniqueSentences[uniqueSentences.length - 1]
    if (!prev || prev.toLowerCase() !== norm) uniqueSentences.push(sentence)
  }

  t = uniqueSentences.join(' ').trim()
  t = dedupeConsecutivePhrases(t)

  return t.replace(/\s+([,.;:!?])/g, '$1').trim()
}

async function createWhisperPipeline(modelId) {
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

async function loadTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      let lastError = null

      for (const modelId of WHISPER_MODELS) {
        try {
          console.log(`[stt] Cargando ${modelId}...`)
          const pipe = await createWhisperPipeline(modelId)
          activeModelId = modelId
          console.log(`[stt] Modelo listo: ${modelId}`)
          return pipe
        } catch (error) {
          lastError = error
          console.warn(`[stt] No se pudo cargar ${modelId}:`, error?.message || error)
        }
      }

      throw lastError || new Error('No se pudo cargar ningún modelo Whisper local')
    })()
  }
  return transcriberPromise
}

export function getActiveSttModel() {
  return activeModelId
}

export async function transcribeWavFile(wavPath, language = null, durationSec = 0) {
  const run = async () => {
    const transcriber = await loadTranscriber()
    const audioData = readWavAsFloat32(wavPath)

    if (!audioData?.length) return ''

    const duration = durationSec || audioData.length / SAMPLE_RATE
    const options = buildTranscribeOptions(duration, language)
    const result = await transcriber(audioData, options)

    return cleanTranscription(result?.text || '')
  }

  const job = transcribeQueue.then(run, run)
  transcribeQueue = job.catch(() => {})
  return job
}

export async function warmupSttModel() {
  await loadTranscriber()
}
