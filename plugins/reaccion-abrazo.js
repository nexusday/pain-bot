import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'hug',
  comandos: ['hug', 'abrazo'],
  texto: (remitente, objetivo) => `${remitente} le dio un fuerte abrazo a ${objetivo} 🫂`,
})

export default handler
