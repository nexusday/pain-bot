import { parentPort } from 'worker_threads'

process.env.ORT_LOGGING_LEVEL = '3'

const MODELOS = ['Xenova/whisper-base', 'Xenova/whisper-tiny']

let listo = null
let modeloActivo = ''

function cargar() {
  if (!listo) {
    listo = (async () => {
      const {
        AutomaticSpeechRecognitionPipeline,
        AutoProcessor,
        AutoTokenizer,
        WhisperForConditionalGeneration,
        env,
      } = await import('@xenova/transformers')

      env.allowLocalModels = true
      env.useBrowserCache = false

      let ultimo = null
      for (const modelId of MODELOS) {
        try {
          const opts = { quantized: true }
          const [model, processor, tokenizer] = await Promise.all([
            WhisperForConditionalGeneration.from_pretrained(modelId, opts),
            AutoProcessor.from_pretrained(modelId, opts),
            AutoTokenizer.from_pretrained(modelId, opts),
          ])
          modeloActivo = modelId
          return new AutomaticSpeechRecognitionPipeline({
            task: 'automatic-speech-recognition',
            model,
            processor,
            tokenizer,
          })
        } catch (error) {
          ultimo = error
        }
      }
      throw ultimo || new Error('No se pudo cargar Whisper')
    })()
  }
  return listo
}

parentPort.on('message', async (msg) => {
  const id = msg?.id
  try {
    const pipe = await cargar()
    if (msg?.tipo === 'ping') {
      parentPort.postMessage({ id, ok: true, modelId: modeloActivo })
      return
    }
    const resultado = await pipe(msg.audio, msg.opciones || {})
    parentPort.postMessage({ id, text: resultado?.text || '', modelId: modeloActivo })
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message || String(error) })
  }
})
