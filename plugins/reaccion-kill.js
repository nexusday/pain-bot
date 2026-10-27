import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'kill',
  comandos: ['kill', 'matar'],
  texto: (remitente, objetivo) => `${remitente} eliminó a ${objetivo} 💀`,
})

export default handler
