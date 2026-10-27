# Reacciones SFW con Delirius

Los comandos de reacción usan la API global configurada en
`global.APIs.delirius` (`config.js`). Si se define `key`, se envía como
`apikey`; no es obligatorio.

La ruta consultada es `GET /reactions/<tipo>`. La respuesta debe tener
`status: true` y `data.url` apuntando a un `.mp4`. El CDN se normaliza a HTTPS
antes de enviarlo. No se envían GIFs ni se ejecuta FFmpeg.

## Uso

- Se puede mencionar a una persona: `/kiss @usuario`.
- Se puede responder a su mensaje: `/kiss`.
- La mención explícita tiene prioridad sobre el autor del mensaje citado.
- Las menciones que aparecen dentro del mensaje citado no se usan como objetivo.
- Si el comando acepta uso individual, también funciona sin mención ni respuesta.

## Comandos

| Comando | Alias | Objetivo | Acción |
| --- | --- | --- | --- |
| `/kiss` | `/beso` | obligatorio | beso |
| `/hug` | `/abrazo` | obligatorio | abrazo |
| `/slap` | `/bang`, `/bofetada` | obligatorio | bofetada |
| `/kill` | `/matar` | obligatorio | eliminación de broma |
| `/pat` | `/acariciar`, `/caricia` | obligatorio | caricias |
| `/cuddle` | `/acurrucar` | obligatorio | acurrucarse |
| `/handhold` | `/mano` | obligatorio | tomar de la mano |
| `/highfive` | `/choca`, `/chocar` | obligatorio | chocar los cinco |
| `/confy` | `/consolar` | obligatorio | consolar |
| `/bite` | `/morder` | obligatorio | morder |
| `/bonk` | `/coscorron` | obligatorio | coscorrón |
| `/bully` | `/molestar` | obligatorio | molestar |
| `/lick` | `/lamer` | obligatorio | lamer |
| `/poke` | `/picar` | obligatorio | picar |
| `/tickle` | `/cosquillas` | obligatorio | cosquillas |
| `/yeet` | `/lanzar` | obligatorio | lanzar |
| `/patada` | — | obligatorio | patada de reacción |
| `/reir` | `/risa` | opcional | risa |
| `/happy` | `/alegre`, `/feliz` | opcional | alegría |
| `/sad` | `/triste` | opcional | tristeza |
| `/cry` | `/llorar` | opcional | llanto |
| `/angry` | `/enojado` | opcional | enojo |
| `/dance` | `/danzar` | opcional | baile |
| `/blush` | `/sonrojo`, `/sonrojarse` | opcional | sonrojo |
| `/smile` | `/sonreir` | opcional | sonrisa |
| `/wink` | `/guino`, `/guiño` | opcional | guiño |
| `/pout` | `/berrinche` | opcional | berrinche |
| `/smug` | `/presumir` | opcional | presumir |
| `/cringe` | — | opcional | vergüenza ajena |
| `/fluff` | `/esponjar` | opcional | esponjarse |
| `/tail` | `/cola` | opcional | mover la cola |
| `/eevee` | — | opcional | emoción estilo Eevee |
| `/lay` | `/recostar` | opcional | recostarse |
| `/nom` | `/nam` | opcional | mordisquear |

`/kick` no se registra como reacción porque ya existe como comando de
moderación para expulsar del grupo. La reacción de patada está disponible como
`/patada`.

## Errores

Si la API no responde, devuelve un JSON inválido o una URL que no sea MP4, se
envía un aviso genérico. El error de red no se publica en el chat porque puede
incluir la URL con la clave. La API no se consulta cuando falta un objetivo
obligatorio.

El endpoint `glomp` devuelve un 404 interno; por eso no se registra. Tras
desplegar cambios en estos módulos, reinicia los procesos del bot para no
conservar imports antiguos.
