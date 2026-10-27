import { crearReaccionesDelirius } from '../lib/reacciones-delirius.js'

const conObjetivo = (texto, individual) => (remitente, objetivo) =>
  objetivo ? texto(remitente, objetivo) : individual(remitente)

const handler = crearReaccionesDelirius([
  {
    tipo: 'bite',
    comandos: ['bite', 'morder'],
    texto: (remitente, objetivo) => `${remitente} mordió a ${objetivo} 😬`,
  },
  {
    tipo: 'blush',
    comandos: ['blush', 'sonrojo', 'sonrojarse'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} se sonrojó por ${objetivo} 😳`,
      remitente => `${remitente} se sonrojó 😳`,
    ),
  },
  {
    tipo: 'bonk',
    comandos: ['bonk', 'coscorron'],
    texto: (remitente, objetivo) => `${remitente} le dio un coscorrón a ${objetivo} 🔨`,
  },
  {
    tipo: 'bully',
    comandos: ['bully', 'molestar'],
    texto: (remitente, objetivo) => `${remitente} está molestando a ${objetivo} 😈`,
  },
  {
    tipo: 'confy',
    comandos: ['confy', 'consolar'],
    texto: (remitente, objetivo) => `${remitente} consoló a ${objetivo} 🫂`,
  },
  {
    tipo: 'cringe',
    comandos: ['cringe'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} sintió cringe por ${objetivo} 😬`,
      remitente => `${remitente} sintió cringe 😬`,
    ),
  },
  {
    tipo: 'cuddle',
    comandos: ['cuddle', 'acurrucar'],
    texto: (remitente, objetivo) => `${remitente} se acurrucó con ${objetivo} 🥰`,
  },
  {
    tipo: 'eevee',
    comandos: ['eevee'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} se emocionó con ${objetivo} como Eevee 🐾`,
      remitente => `${remitente} se emocionó como Eevee 🐾`,
    ),
  },
  {
    tipo: 'fluff',
    comandos: ['fluff', 'esponjar'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} esponjó a ${objetivo} ☁️`,
      remitente => `${remitente} se esponjó ☁️`,
    ),
  },
  {
    tipo: 'handhold',
    comandos: ['handhold', 'mano'],
    texto: (remitente, objetivo) => `${remitente} tomó de la mano a ${objetivo} 🤝`,
  },
  {
    tipo: 'highfive',
    comandos: ['highfive', 'choca', 'chocar'],
    texto: (remitente, objetivo) => `${remitente} chocó los cinco con ${objetivo} ✋`,
  },
  {
    tipo: 'lay',
    comandos: ['lay', 'recostar'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} se recostó junto a ${objetivo} 😴`,
      remitente => `${remitente} se recostó 😴`,
    ),
  },
  {
    tipo: 'lick',
    comandos: ['lick', 'lamer'],
    texto: (remitente, objetivo) => `${remitente} lamió a ${objetivo} 👅`,
  },
  {
    tipo: 'nom',
    comandos: ['nom', 'nam'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} le dio un mordisquito a ${objetivo} 🍪`,
      remitente => `${remitente} está mordisqueando 🍪`,
    ),
  },
  {
    tipo: 'poke',
    comandos: ['poke', 'picar'],
    texto: (remitente, objetivo) => `${remitente} picó a ${objetivo} 👉`,
  },
  {
    tipo: 'pout',
    comandos: ['pout', 'berrinche'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} le hizo un berrinche a ${objetivo} 😤`,
      remitente => `${remitente} hizo un berrinche 😤`,
    ),
  },
  {
    tipo: 'smile',
    comandos: ['smile', 'sonreir'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} le sonrió a ${objetivo} 😊`,
      remitente => `${remitente} sonrió 😊`,
    ),
  },
  {
    tipo: 'smug',
    comandos: ['smug', 'presumir'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} presume ante ${objetivo} 😏`,
      remitente => `${remitente} presume 😏`,
    ),
  },
  {
    tipo: 'tail',
    comandos: ['tail', 'cola'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} mueve la cola por ${objetivo} 🐺`,
      remitente => `${remitente} mueve la cola 🐺`,
    ),
  },
  {
    tipo: 'tickle',
    comandos: ['tickle', 'cosquillas'],
    texto: (remitente, objetivo) => `${remitente} le hizo cosquillas a ${objetivo} 🤭`,
  },
  {
    tipo: 'wink',
    comandos: ['wink', 'guino', 'guiño'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} le guiñó el ojo a ${objetivo} 😉`,
      remitente => `${remitente} guiñó el ojo 😉`,
    ),
  },
  {
    tipo: 'yeet',
    comandos: ['yeet', 'lanzar'],
    texto: (remitente, objetivo) => `${remitente} lanzó a ${objetivo} por los aires 🚀`,
  },
  {
    tipo: 'kick',
    comandos: ['patada'],
    texto: (remitente, objetivo) => `${remitente} le dio una patada a ${objetivo} 🦵`,
  },
  {
    tipo: 'cry',
    comandos: ['cry', 'llorar'],
    opcional: true,
    texto: conObjetivo(
      (remitente, objetivo) => `${remitente} llora por ${objetivo} 😭`,
      remitente => `${remitente} está llorando 😭`,
    ),
  },
])

export default handler
