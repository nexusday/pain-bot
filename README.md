# Pain Bot

**By Sunkovv**

<p align="center">
  <a href="https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7">
    <img src="https://img.shields.io/badge/Comunidad-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Comunidad de WhatsApp">
  </a>
  <a href="https://clientes.nexcodea.com/">
    <img src="https://img.shields.io/badge/Hosting%20para%20bot-barato-111827?style=for-the-badge&logo=icloud&logoColor=white" alt="Hosting para bot barato">
  </a>
</p>

- **Comunidad de WhatsApp:** [unirse al grupo](https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7)
- **Hosting para bot barato:** [clientes.nexcodea.com](https://clientes.nexcodea.com/)

Bot de WhatsApp multi-dispositivo (Baileys). Descargas, IA, administraci├│n de grupos, RPG, stickers y m├ís.

SQLite usa un m├│dulo nativo que debe instalarse para el sistema operativo del servidor.
Sharp tambi├®n necesita su runtime opcional para la plataforma. No copies `node_modules`
de Windows a Linux ni entre arquitecturas.

```
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

| | |
|---|---|
| **Repositorio** | [github.com/nexusday/pain-bot](https://github.com/nexusday/pain-bot) |
| **Comunidad** | [Grupo de WhatsApp](https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7) |
| **Hosting** | [NexCodea ÔÇö hosting para bot barato](https://clientes.nexcodea.com/) |
| **Runtime** | Node.js 20.17+ |
| **Dependencias** | Instalar en el sistema operativo donde correr├í el bot |
| **Licencia** | GPL-3.0-or-later |

---

## ├ìndice

1. [Requisitos](#requisitos)
2. [Inicio r├ípido](#inicio-r├ípido)
3. [Termux](#termux)
4. [Vincular cuenta](#vincular-cuenta)
5. [PM2 en Termux](#pm2-en-termux)
6. [Configuraci├│n](#configuraci├│n)
7. [Uso](#uso)
8. [Estructura](#estructura)
9. [Actualizar](#actualizar)
10. [Panel web](#panel-web)
11. [Problemas frecuentes](#problemas-frecuentes)
12. [Aviso y cr├®ditos](#aviso-y-cr├®ditos)

---

## Requisitos

| Componente | Detalle |
|------------|---------|
| Node.js | 20.17 o superior |
| Git | versi├│n reciente |
| FFmpeg | recomendado (audio, video, stickers) |
| npm | instala los m├│dulos nativos para la plataforma actual |

No reutilices `node_modules` instalado en otro sistema operativo: incluye el binario
nativo de SQLite y debe corresponder a Linux, Windows o Termux donde se ejecutar├í.

---

## Inicio r├ípido

Windows, Linux o macOS:

```bash
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

`npm install` prepara las dependencias y el m├│dulo nativo SQLite para este sistema.
Al iniciar, `npm start` valida que Sharp pueda procesar una imagen. Si falta el runtime,
instala las dependencias opcionales de la plataforma (incluido Linux x64 en Pterodactyl);
si la instalaci├│n falla, detiene el arranque y muestra el error en vez de dejar que fallen
los plugins de im├ígenes durante su recarga.

En Debian/Ubuntu, si te falta FFmpeg:

```bash
sudo apt update
sudo apt install -y ffmpeg git
```

El comando `npm start` comprueba el m├│dulo nativo `sqlite3` y fija la versi├│n 5.1.7 para
evitar que una actualizaci├│n descargue el binario 6.x incompatible con la GLIBC
de algunos contenedores. Si el precompilado de la plataforma no sirve, compila
SQLite desde el c├│digo fuente local y muestra el diagn├│stico completo si falla.
Si necesitas repetir la comprobaci├│n manualmente:

```bash
node scripts/ensure-sqlite.js
```

---

## Termux

### Preparar el entorno

Termux desde [F-Droid](https://f-droid.org/packages/com.termux/). Luego:

```bash
termux-setup-storage
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git ffmpeg
```

Verifica:

```bash
node -v && git --version
```

### Clonar y arrancar

Instala las dependencias en Termux para compilar/seleccionar los m├│dulos nativos:

```bash
cd ~
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

Si ya clonaste el proyecto en Termux y necesitas reparar dependencias:

```bash
npm install --no-bin-links
```

---

## Vincular cuenta

El m├®todo principal de vinculaci├│n es por **c├│digo de 8 d├¡gitos** (pairing code). No hace falta escanear QR.

> **Desde el panel web (recomendado):** el panel arranca **antes que nada** del
> bot, as├¡ que est├í disponible aunque el principal todav├¡a no est├® vinculado.
> Entra en **Administraci├│n ÔåÆ Bot principal**, escribe el n├║mero y genera el
> c├│digo. No hace falta tocar la consola. Si prefieres la terminal, sigue
> leyendo.

### Arranque

```bash
cd pain-bot   # o: cd ~/pain-bot en Termux
npm start
```

### Pasos en la terminal

Esto solo se usa si el panel est├í apagado (`PAIN_WEB_ENABLED=0`); con el panel
activo la consola ya no pregunta nada.

1. Cuando pregunte el m├®todo de sesi├│n, escribe:

```text
code
```

2. Ingresa el n├║mero del WhatsApp que usar├í el bot, **con c├│digo de pa├¡s y sin s├¡mbolos**:

```text
51999999999
```

3. La terminal mostrar├í un c├│digo de **8 caracteres** (ej. `ABCD-EFGH`).

### Pasos en WhatsApp (tel├®fono)

1. Abre WhatsApp en el dispositivo del n├║mero indicado  
2. **Ajustes ÔåÆ Dispositivos vinculados ÔåÆ Vincular un dispositivo**  
3. Elige **Vincular con n├║mero de tel├®fono**  
4. Escribe el c├│digo de 8 d├¡gitos que sali├│ en la terminal  

La sesi├│n se guarda en `Sessions/`. Conserva esa carpeta si no quieres volver a vincular.

> Tip: la primera vinculaci├│n hazla con `npm start` en primer plano para copiar el c├│digo con calma. Despu├®s puedes pasar a PM2.

Detener el proceso: `Ctrl + C`.

---

## El panel web nunca se corta

Los usuarios del panel no deben notar nada cuando el administrador cambia el
n├║mero del bot principal:

- **El panel arranca primero**: antes de cargar la base de datos, de crear el
  socket de WhatsApp y de conectar los sub-bots. La web est├í disponible
  aunque el principal todav├¡a no est├® vinculado.
- **Desvincular o re-vincular NO reinicia el proceso**: se cierra la sesi├│n de
  WhatsApp, se borran las credenciales y se crea un socket principal nuevo
  (sin credenciales) dentro del mismo proceso. El panel sigue escuchando y
  los sub-bots reconectan solos.
- **"Cambiar n├║mero"** hace todo en un paso: desvincula, recrea el socket y
  deja el c├│digo de 8 d├¡gitos listo para escribir en WhatsApp.
- **Si la sesi├│n del principal est├í ca├¡da** (WhatsApp la cerr├│, el socket no
  responde), el panel lo detecta, lo marca como *"Sesi├│n ca├¡da"* y al generar
  el c├│digo **borra la sesi├│n vieja y crea una nueva en el mismo proceso**.
  No hay que reiniciar nada.
- **"Quitar el n├║mero"** borra el n├║mero principal guardado (├║til para
  cambiar de n├║mero o para dejar el principal sin vincular).
- No hay ning├║n bot├│n que reinicie el proceso: la web nunca se corta y nadie
  se queda a medias en una vinculaci├│n.
- Si el principal se desconecta solo (WhatsApp revoca la sesi├│n), el panel
  sigue vivo y el administrador puede volver a emparejarlo desde la web.
- Si WhatsApp cierra la sesi├│n del principal (c├│digo **403** o cierre de
  sesi├│n), el bot **no se queda parado**: se borran las credenciales del
  principal, se levanta un socket limpio y el panel muestra *"El bot principal
  se desconect├│"* con el formulario para volver a vincularlo. Los sub-bots
  siguen conectados y la web nunca se corta.
- Los sub-bots no se tocan: siguen con sus propias sesiones y reconectan solos.

### ┬┐Los sub-bots funcionan sin el principal?

**S├¡**, y ahora tambi├®n en instalaci├│n nueva:

- **Los sub-bots son independientes del principal.** Cada uno tiene su sesi├│n
  y su worker: si el principal se cae, se desvincula o WhatsApp le cierra la
  sesi├│n (403), los sub-bots **siguen conectados y funcionando**.
- **Vincular un sub-bot desde el panel no exige que el principal est├®
  vinculado**: el panel ya no devuelve `main_not_linked`. Al terminar el
  emparejamiento, el worker conecta el sub-bot y el supervisor lo levanta
  aunque el principal no exista todav├¡a.
- Los workers solo esperan al principal cuando **todav├¡a no hay ning├║n
  sub-bot vinculado** (instalaci├│n reci├®n hecha): no tiene sentido levantar
  150 sub-bots mientras el usuario sigue escribiendo el c├│digo del principal.
  En cuanto existe un sub-bot, los workers arrancan igual.
- Lo que s├¡ es exclusivo del principal: que ├®l conteste en la comunidad
  oficial, los comandos del owner, la lista de bots y el aviso de canales.

---

## PM2 en Termux

Para mantener el bot en segundo plano sin dejar la terminal abierta:

```bash
npm install -g pm2
cd ~/pain-bot
```

**Importante:** vincula primero con `npm start` y el c├│digo. Cuando la sesi├│n ya est├® en `Sessions/`:

```bash
pm2 start index.js --name painbot
pm2 save
```

| Comando | Acci├│n |
|---------|--------|
| `pm2 status` | Estado del proceso |
| `pm2 logs painbot` | Logs en vivo |
| `pm2 restart painbot` | Reiniciar |
| `pm2 stop painbot` | Detener |
| `pm2 delete painbot` | Eliminar de PM2 |

Recuperar PM2 al reabrir Termux:

```bash
pm2 startup
pm2 save
```

Desactiva la optimizaci├│n de bater├¡a para Termux en Android; si no, el sistema puede matar el proceso.

---

## Configuraci├│n

Edita `config.js` (mejor con el bot detenido al cambiar owners):

| Variable | Descripci├│n |
|----------|-------------|
| `global.owner` | Owners: `['codigoPaisNumero', 'Nombre', true]` |
| `global.namebot` | Nombre del bot |
| `global.packname` | Nombre en stickers |
| `global.author` | Autor |
| `global.moneda` | Moneda del RPG |
| `global.APIs` | APIs externas |

```js
global.owner = [
  ['51999999999', 'TuNombre', true],
]
```

Sin `+`, espacios ni guiones en el n├║mero.

---

## Uso

Prefijo por defecto: `.`

```text
.menu
.menu2
.play nombre de canci├│n
.video b├║squeda o enlace
.ia mensaje
.s
```

M├ís comandos en `.menu` / `.menu2` dentro del chat.

---

## Estructura

```text
pain-bot/
Ôö£ÔöÇÔöÇ config.js         Configuraci├│n global
Ôö£ÔöÇÔöÇ index.js          Entrada
Ôö£ÔöÇÔöÇ main.js           Conexi├│n y ciclo
Ôö£ÔöÇÔöÇ handler.js        Mensajes y comandos
Ôö£ÔöÇÔöÇ plugins/          Comandos (hot reload)
Ôö£ÔöÇÔöÇ lib/              Utilidades y modos
Ôö£ÔöÇÔöÇ node_modules/     Dependencias instaladas para esta plataforma
Ôö£ÔöÇÔöÇ storage/          Datos persistentes
Ôö£ÔöÇÔöÇ Sessions/         Sesi├│n de WhatsApp (no versionar)
ÔööÔöÇÔöÇ package.json
```

Los plugins suelen recargarse al guardar. Si no aparece uno nuevo, reinicia con `npm start` o `pm2 restart painbot`.

Solo existe `/pri 1`: el bot principal tiene su proceso y todos los sub-bots
comparten un ├║nico worker. `/pri 2` fue retirado y cualquier modo antiguo
guardado se ignora. El procesamiento de im├ígenes usa un hilo libvips por
operaci├│n por defecto; puedes ajustar ese l├¡mite con `PAIN_SHARP_CONCURRENCY`.

---

## Actualizar

```bash
cd pain-bot
git pull origin main
npm install
npm start
# o: pm2 restart painbot
```

Ejecuta `npm install` tambi├®n despu├®s de actualizar: el m├│dulo nativo de SQLite
debe coincidir con la plataforma del servidor.

Haz backup de `Sessions/` y de tu `config.js` antes de un `git pull` si tocaste owners o APIs.

---

## Problemas frecuentes

**No sale el c├│digo de vinculaci├│n**  
Escribe `code` (no `qr`) cuando pregunte el m├®todo. Cierra otras instancias del bot y vuelve a `npm start`.

**El c├│digo expira o no se acepta**  
Pide uno nuevo reiniciando. En WhatsApp usa *Vincular con n├║mero de tel├®fono*, no el esc├íner de c├ímara.

**Error de m├│dulos / ÔÇ£Cannot find moduleÔÇØ**  
Instala las dependencias para la plataforma actual:

```bash
# PC
npm install

# Termux
npm install --no-bin-links
```
**Sesi├│n cerrada / logged out**

```bash
rm -rf Sessions
npm start
```

Vuelve a vincular con el c├│digo de 8 d├¡gitos.

**El bot no responde en un grupo**  
Revisa si est├í desactivado, silenciado o si faltan permisos de admin para comandos de grupo.

**Termux se cierra solo**  
Ajustes de Android ÔåÆ sin optimizaci├│n de bater├¡a para Termux.

---

## Aviso y cr├®ditos

Uso personal o educativo. Respeta las [pol├¡ticas de WhatsApp](https://www.whatsapp.com/legal) y la ley de tu pa├¡s. El uso indebido de automatizaci├│n puede banear la cuenta vinculada; conviene un n├║mero secundario.

| | |
|---|---|
| **Proyecto** | Pain Bot |
| **By** | Sunkovv |
| **N├║cleo** | [Baileys](https://github.com/WhiskeySockets/Baileys) (WhiskeySockets) |
| **Repositorio** | https://github.com/nexusday/pain-bot.git |

---

*Pain Bot ÔÇö By Sunkovv*
# Arquitectura de procesos y sesiones

`index.js` levanta **un ├║nico** proceso `main.js` que hospeda el bot principal
y todos los subbots (`global.conns`). Los plugins se cargan **una vez**, no una
vez por worker. El panel web sigue en un proceso HTTP aparte y solo se comunica
por RPC.

Ya **no existe** el supervisor cl├ísico de 5 grupos, ni los leases, la admisi├│n
por ficheros o los estados de worker. La vida de las sesiones vive en un ├║nico
registro (`lib/sessions/registry.js`):

- Un solo watchdog y una sola cola de arranque/reconexi├│n con espaciado
  (token-bucket) para no lanzar 300 handshakes a la vez.
- El estado que ve el panel se publica desde ese registro; ning├║n comando lee
  ficheros de estado en el camino de un mensaje.
- Si el proceso muere por un fallo real, un supervisor m├¡nimo lo reinicia con
  backoff. Un error de un mensaje o de un plugin ya **no** tumba la flota.

**Los subbots son independientes del principal.** Arrancan 3 s despu├®s y el
panel puede vincularlos aunque el principal est├® emparejando.

**`/subme <mensaje>`** no lo manda el principal a los subbots: **cada subbot se
escribe a s├¡ mismo** el mensaje en su propio chat. El principal solo reparte la
orden.

**`/modosub <n>`** (tambi├®n `/modobot`, `/botactivo`, `/onlybot`) elige qu├® bot
responde en ese grupo. Solo contesta el bot elegido; los dem├ís se callan.
`/modosub all` vuelve a dejar que respondan todos (y multiplica el trabajo por
cada bot del grupo: ├║salo con criterio).

---

# Rendimiento con muchos sub-bots

- **Env├¡o sin red:** la cita "verificada" se arma en local con el `pushName`.
  La foto de perfil sale solo de una cach├® (24 h) que se descarga en segundo
  plano; el env├¡o nunca espera a WhatsApp ni a un HTTP.
- **Auth en memoria:** cada sesi├│n mantiene credenciales y claves Signal en RAM
  y las persiste con un diario (`auth-keys.ndjson`) + snapshot
  (`auth-keys.json`). Ya no se escribe un fichero por clave en cada mensaje.
  La compactaci├│n del snapshot se hace en un worker thread: ya no bloquea los
  sockets durante decenas de segundos.
- **Base de datos incremental:** solo se serializan los usuarios/chats tocados.
  Un flush ligero cada 5 s, sin escaneos completos peri├│dicos. Los comandos ya
  no esperan a un volcado de toda la base.
- **Reconexi├│n directa:** no hay cola global. Cada sesi├│n ca├¡da reintenta en
  1ÔÇô3 s con dispersi├│n aleatoria; solo crece el backoff si la sesi├│n se cae
  repetidamente en menos de 30 s.
- **Cach├®s compartidas:** metadata de grupos en una cach├® global y mensajes en
  un LRU por proceso. Se podan chats y metadata inactivos.
- **Disco:** se limita el media de anti-delete (512 MB por defecto), se podan
  logs viejos y se avisa si queda menos del 10 % libre.
- **Cat├ílogo de personajes:** 52 MB que se liberan tras 10 min sin uso.

Diagnóstico: /mem, /diag y /mem limpiar (fuerza poda y GC).

# Carriles y tiers

- **Carriles (PAIN_LANES):** los sub-bots se reparten entre N procesos.
  Cada proceso tiene su propia base de datos SQLite (sin contención de locks).
  El panel agrega las sesiones de todos los carriles.
- **Presupuesto de carriles por tier:** el supervisor calcula la RAM/CPU
  reales del contenedor (cgroups) y reparte un presupuesto global:
  - **VIP primero**: carriles de 4 GB, ~10 bots por carril.
  - **Premium después**: carriles de 3 GB, ~15 bots por carril.
  - **Free al final**: carriles de 1 GB, ~20 bots por carril.
  Así Premium/VIP tienen menos carriles pero más memoria y menos carga;
  Free ocupa el resto sin reventar la VPS.
- **Tiers (PAIN_TIER):** ree, premium o ip. Cada tier tiene un perfil
  de recursos (memoria, cachés, keepalive, frecuencia de escritura).
- `free`: 1024 MB, cachés reducidas, keepalive 60 s. Optimizado para bajo consumo.
- `premium`: 3072 MB, cachés normales, keepalive 30 s. Hasta 50 conexiones.
  - ip: Próximamente. Servidores dedicados con DB aislada.
| `PAIN_DB_COMMIT_MS` | `5000` | Commit ligero de colecciones peque├▒as |
| `PAIN_DB_FULL_SCAN_MS` | `0` (nunca) | Escaneo completo de seguridad (0 = nunca) |
| `PAIN_AUTH_CREDS_MS` | `250` | Debounce de `creds.json` |
| `PAIN_AUTH_JOURNAL_MS` | `500` | Debounce del diario de claves |
| `PAIN_AUTH_COMPACT_MS` | `7200000` | Cada cu├ínto se compacta el diario (en un worker) |
| `PAIN_AUTH_JOURNAL_MB` | `16` | Tama├▒o del diario que fuerza la compactaci├│n |
| `PAIN_AUTH_WORKERS` | `2` | Hilos de compactaci├│n (1ÔÇô4) |
| `PAIN_QUOTED_AVATAR` | `1` | `0` = cita sin foto (cero red en el env├¡o) |
| `PAIN_AVATAR_TTL_MS` | `86400000` | Vida de la foto cacheada |
| `PAIN_AVATAR_QUEUE` | `500` | Descargas de fotos en cola como m├íximo |
| `PAIN_ANTIDELETE_MEDIA_MB` | `512` | Tope global de media de anti-delete |
| `PAIN_DISK_FREE_PERCENT` | `10` | Aviso de disco libre |
| `PAIN_CATALOG_IDLE_MS` | `600000` | Libera el cat├ílogo tras ese tiempo sin uso |
| `PAIN_MAX_CHATS_SOCKET` | `200` | Chats guardados por socket |
| `PAIN_MAX_GROUP_META` | `400` | Metadata de grupos en cach├® |
| `PAIN_MAX_MSG_CACHE` | `12000` | Mensajes cacheados por proceso |
| `PAIN_MAX_MSG_CHAT` | `50` | Mensajes cacheados por chat |
| `PAIN_GROUP_META_TTL_MS` | `1800000` | Antig├╝edad m├íxima de la metadata de un grupo |
| `PAIN_RSS_ALERT_MB` | `1200` | RSS que activa la poda agresiva |
| `PAIN_STT_IDLE_MS` | `300000` | Tiempo sin audio para descargar el modelo de voz |
| `PAIN_MAX_IA_CHATS` | `300` | Chats con memoria de IA por proceso |
| `PAIN_EXIT_ON_UNCAUGHT` | `0` | `1` restaura el reinicio ante cualquier excepci├│n |

---

## Panel web

El proceso del bot levanta un panel HTTP para registrar cuentas y vincular
sub-bots desde el navegador. El HTTP vive en un proceso aparte (`worker.js`);
el proceso de WhatsApp nunca abre el puerto.

- Puerto por defecto: **`10022`** (`global.webPanel.port` o `PAIN_WEB_PORT`).
- Host: `0.0.0.0`, para que Pterodactyl pueda enrutar la allocation.
- Base de datos propia: `storage/webpanel.sqlite`. No se mezcla con la base
  caliente del bot (`storage/databases/database.sqlite`).
- Las sesiones de WhatsApp siguen en `Serbot/<n├║mero>/`; mientras se vinculan
  llevan un archivo `.pairing` para que el supervisor no las conecte, archive
  ni purge a mitad del proceso.
- El bot principal debe estar vinculado antes de generar c├│digos desde la web.
  Si no lo est├í, el panel responde `main_not_linked`.
- La interfaz es una SPA sin dependencias: tema oscuro, logo del bot, barra
  lateral plegable (bot├│n de men├║ tambi├®n en escritorio) y dise├▒o adaptable a
  m├│vil y escritorio.

- **Salud por servidor**: cada tarjeta muestra un anillo 0-100 calculado con el
  peor carril (latencia p99, CPU y bots conectados), además del uptime, las
  caídas 428 y los reintentos de ese servidor. Incluye ranking de los 3 más
  sanos y distintivos **Más rápido** / **Más carga**. Las métricas se publican
  cada 60 s desde cada carril, sin que el panel tenga que consultarlos.

### Gestionar el bot principal

En **Administraci├│n ÔåÆ Bot principal** el administrador puede:

- **Vincular** un n├║mero: el panel pide un c├│digo de 8 d├¡gitos al socket del
  principal y lo muestra en pantalla para escribirlo en WhatsApp ÔåÆ Dispositivos
  vinculados ÔåÆ Vincular con n├║mero.
- **Desvincular** el n├║mero actual: se cierra la sesi├│n en WhatsApp y se
  borran las credenciales locales (`sessions/`).
- **Cambiar de n├║mero**: desvincula y reinicia el proceso en un solo paso.
- **Reiniciar el bot**: relanza el proceso principal (el supervisor lo vuelve a
  levantar). El panel espera a que vuelva y se recarga solo.

Endpoints (solo administradores, con CSRF y validaci├│n de origen):

| M├®todo | Ruta | Qu├® hace |
|---|---|---|
| `GET` | `/api/main` | Estado de la sesi├│n principal |
| `POST` | `/api/main/code` | Genera un c├│digo de vinculaci├│n |
| `POST` | `/api/main/relink` | Cambia el n├║mero: desvincula, recrea el socket y devuelve el c├│digo |
| `POST` | `/api/main/unlink` | Desvincula (el panel sigue en marcha) |
| `POST` | `/api/main/restart` | Reinicia el proceso principal (corta el panel unos segundos) |

El estado del principal tambi├®n viaja en `/api/config` como `mainLinked` para
que los usuarios vean el aviso cuando el bot principal a├║n no est├í vinculado.

### Todo se hace desde el panel

Con el panel activo, la vinculaci├│n de sub-bots **no se hace en el chat**:

- `/code` y `/qr` responden con la **URL global del panel** para que el
  usuario cree su sub-bot desde la web.
- El **men├║ del bot** muestra ese mismo link global.
- Al vincularse desde el panel, el sub-bot **se escribe a s├¡ mismo** (su chat
  "mensajes para ti mismo", igual que `/subme`) con el resumen de la
  vinculaci├│n: nombre, n├║mero, usuario y los comandos que puede usar
  (`.setbotname`, `.setbotimg`, `.setautoread`, `.antipv`, `.setlen`,
  `.setmenu`, `.menu`).

La URL global sale de `PAIN_WEB_PUBLIC_URL` o, si no est├í, de
`PAIN_WEB_SUBDOMAIN` + `PAIN_WEB_DOMAIN`.

### Configurar tu sub-bot desde el panel

En **Mis bots** cada sub-bot tiene un bot├│n de engranaje (*Configurar*) que
abre todo lo que se puede cambiar, sin pasar por el chat:

| Opci├│n | Equivale a | Qu├® cambia |
|---|---|---|
| Nombre del bot | `.setbotname` | El nombre que sale en el men├║ y en los mensajes |
| Imagen del men├║ | `.setbotimg` | La foto que se env├¡a con el men├║ (JPG/PNG/WEBP, m├íx. 4 MB) |
| Idioma | `.setlen es/in/pt` | El idioma del bot |
| Estilo del men├║ | `.setmenu ios/android` | Carrusel con botones (Android) o lista de secciones (iOS) |
| Marcar como le├¡dos | `.setautoread on/off` | El doble check azul autom├ítico |
| Privado con desconocidos | `.antipv on/off` | Que no conteste en privado a quien no es owner |

A la derecha del formulario hay una **vista previa de c├│mo se ver├í el men├║ en
WhatsApp**: la imagen, la burbuja con el men├║ tal cual llega al chat y la lista
de secciones. La vista previa se arma con las **mismas funciones** que usa el
bot, as├¡ que no es una aproximaci├│n: es el men├║ real.

Todo se guarda en `Serbot/<n├║mero>/config.json`, el mismo archivo que leen
los comandos, as├¡ que el cambio aplica al siguiente mensaje sin tocar nada
m├ís.

Endpoints (solo el due├▒o del sub-bot o un administrador):

| M├®todo | Ruta | Qu├® hace |
|---|---|---|
| `GET` | `/api/bots/:numero/config` | Configuraci├│n + vista previa del men├║ |
| `PATCH` | `/api/bots/:numero/config` | Guarda nombre, idioma, men├║, auto-leer y anti-pv |
| `POST` | `/api/bots/:numero/config/image` | Sube la imagen del men├║ (data URL) |
| `GET` | `/api/bots/:numero/image` | Devuelve la imagen configurada |

### Entrar como usuario (acting as)

En **Administraci├│n ÔåÆ Usuarios** cada cuenta tiene un bot├│n de persona: el
admin **entra en su panel sin necesitar su contrase├▒a**. Es ├║til para ver
exactamente lo que ve el usuario (sus sub-bots, su men├║, sus l├¡mites) o para
ayudarlo a configurar su bot.

- Mientras est├í acting as, arriba del panel hay una banda amarilla:
  *"Est├ís acting as @usuario"* con el bot├│n **Volver a @admin**.
- Al volver, se crea una sesi├│n nueva de administrador: la del admin nunca se
  pierde (queda el registro original de auditor├¡a).
- Todo queda en la **auditor├¡a**: `admin.impersonate` y
  `admin.stop_impersonating`.
- Solo los administradores pueden hacerlo, y nunca sobre una cuenta
  bloqueada.

Endpoints:

| M├®todo | Ruta | Qu├® hace |
|---|---|---|
| `POST` | `/api/admin/impersonate/:id` | Entra como ese usuario |
| `POST` | `/api/auth/stop-impersonating` | Vuelve a la cuenta de administrador |

### Comunidades de WhatsApp

En **Administraci├│n ÔåÆ Comunidades** el administrador publica los grupos de la
comunidad: nombre, enlace de invitaci├│n y descripci├│n. Cada comunidad se puede
**editar** (nombre, enlace y descripci├│n), **ocultar** sin borrarla, copiar su
enlace o **eliminarla**. Los usuarios las ven en la secci├│n **Comunidades** del
panel y entran con un clic ("Unirme a la comunidad").

### Actualizar sin reiniciar (tipo /fix)

En **Administraci├│n ÔåÆ Ajustes ÔåÆ Mantenimiento** hay dos botones:

- **Actualizar en caliente**: hace lo mismo que el comando `/fix` (trae el
  c├│digo del remoto con `git fetch` + `git reset --hard`) y adem├ís:
  - **guarda tus cambios locales** y los reaplica despu├®s del `reset` (el
    comando `/fix` los pisaba),
  - **recarga el handler y los m├│dulos de `lib/`** con el c├│digo nuevo,
  - **recarga los plugins** que cambiaron,
  - **reinicia solo el servidor HTTP del panel** con el c├│digo nuevo.
- **Recargar c├│digo**: solo la recarga en caliente, sin tocar git (sirve si
  editaste archivos a mano).

**No se reinicia el proceso**: los sub-bots no se desconectan y el panel solo
pierde la conexi├│n un instante mientras se recarga (la web espera a que
vuelva y se recarga sola). Lo ├║nico que sigue necesitando un reinicio del
proceso es un cambio en `main.js`; el panel te avisa cuando pasa.

Endpoints (solo administradores):

| M├®todo | Ruta | Qu├® hace |
|---|---|---|
| `POST` | `/api/admin/update` | Actualiza desde el remoto y recarga en caliente |
| `POST` | `/api/admin/reload` | Recarga el c├│digo en caliente sin tocar git |

### L├¡mites por cuenta y por IP

En **Administraci├│n ÔåÆ Ajustes** se configuran todos los topes del panel:

| L├¡mite | D├│nde se guarda | Para qu├® |
|---|---|---|
| M├íximo de sub-bots del servidor | `storage/maxsubs.json` | Tope global de sesiones |
| M├íximo de sub-bots por cuenta | `panel_meta` (`max_subs_per_user`) | Cu├íntas cuentas puede vincular cada usuario |
| M├íximo de cuentas por IP | `panel_meta` (`max_bots_per_ip`) | Cu├íntas cuentas distintas se pueden vincular desde la misma conexi├│n |
| Intentos por hora y usuario | `panel_meta` (`pair_attempts_hour`) | Cu├íntos c├│digos pide un usuario en una hora |
| Intentos por d├¡a y usuario | `panel_meta` (`pair_attempts_day`) | Cu├íntos c├│digos pide un usuario en un d├¡a |
| Intentos por hora y IP | `panel_meta` (`pair_attempts_ip_hour`) | Cu├íntos c├│digos se piden desde una conexi├│n |
| Espera entre c├│digos del mismo n├║mero | `panel_meta` (`pair_cooldown_ms`) | Segundos antes de poder pedir otro c├│digo para el mismo n├║mero |
| Duraci├│n del c├│digo | `panel_meta` (`pair_code_ttl_ms`) | Segundos que vive el c├│digo de 8 d├¡gitos (la cuenta atr├ís del panel) |

`0` significa "sin l├¡mite". Cuando un usuario llega al tope, el panel responde
`user_limit` (403), `ip_limit` (429), `rate_limit`, `rate_limit_day`,
`rate_limit_ip` o `cooldown`, y el mensaje dice **exactamente cu├ínto falta**
("Espera 12 min", "Se libera en 3 h") en vez de un "espera un poco".

### Sesiones: filtros y borrado por oleadas

En **Administraci├│n ÔåÆ Sesiones** se puede filtrar por estado (todas,
conectadas, vinculadas, re-vincular, vinculando, pendientes, sin archivos),
seleccionar varias sesiones con las casillas y borrarlas de una vez. El
borrado se hace **por oleadas de 5** para no saturar el proceso del bot.

Endpoint: `POST /api/admin/sessions/bulk` con `{ phones: [...], batchSize: 5 }`.

### Nodos remotos (VPS para servidores VIP) — modelo Wings

El panel puede usar una VPS aparte como nodo de bots, igual que Pterodactyl:
el **agente se conecta desde la VPS hacia el panel** por WebSocket. No hace
falta abrir puertos en la VPS ni que el panel conozca su IP.

**En el panel:**

1. **Administración → Nodos → Añadir nodo**. El panel genera un UUID y un
   token y te muestra **un solo comando**.
2. Copia el comando. Se ve así:

```bash
curl -fsSL "https://tu-panel.com/api/node/install.sh?uuid=...&token=..." | bash
```

**En la VPS del nodo** solo ejecutas ese comando (con `ffmpeg` instalado en
el sistema). El script descarga el código actual del panel, instala las
dependencias la primera vez y arranca el agente. **No hay que clonar el repo
ni abrir puertos**. Para dejarlo fijo usa `pm2` o `systemd`.

El agente abre la conexión, reporta CPU/RAM/disco/versión/commit y aparece
**en línea** en el panel. Si se cae la red, reintenta solo cada 5-8 s.

**Si el nodo es otro servidor de Pterodactyl/Nexcodea** (no una VPS pelada):

1. Crea el servidor con el egg de Node.js y los recursos que quieras.
2. Descarga `start.sh` desde el panel (botón en la tarjeta del nodo) y súbelo
   al servidor con el gestor de archivos.
3. En **Startup**, pon como comando de arranque: `bash start.sh`.
4. Arranca el servidor. El agente descarga el código, instala dependencias y
   se conecta al panel. No abras puertos: la conexión es saliente.

El panel lee los **cgroups** del contenedor, así que muestra la RAM/CPU del
plan de Pterodactyl, no la del host. Si reinicias el panel, los agentes se
reconectan solos y los bots del nodo siguen corriendo mientras dura el corte.

**Crear un servidor en el nodo:**

1. **Servidores → Crear servidor**: tier `premium` o `vip`, selecciona el
   **Nodo de ejecución** y guarda.
2. En la fila del servidor pulsa **Arrancar en nodo**. El panel envía por la
   WebSocket las credenciales de cada bot y la orden de arranque. El agente
   lanza `main.js` en modo worker con la CPU/RAM de esa VPS.

Los servidores con nodo **no se ejecutan en la VPS del panel**. El supervisor
local los ignora y el agente remoto es el dueño de esos procesos. Los datos
de esos bots quedan en la DB aislada del nodo (`PAIN_DB_MODE=isolated`).

### Variables de entorno

| Variable | Por defecto | Para qu├® |
|---|---|---|
| `PAIN_WEB_ENABLED` | `1` | `0` apaga el panel sin tocar el bot |
| `PAIN_WEB_PORT` | `10022` | Puerto de la allocation |
| `PAIN_WEB_HOST` | `0.0.0.0` | Interfaz de escucha |
| `PAIN_WEB_SUBDOMAIN` | `pain` | Subdominio p├║blico |
| `PAIN_WEB_DOMAIN` | `nexcodea.com` | Dominio base |
| `PAIN_WEB_PUBLIC_URL` | derivada | URL p├║blica completa; manda sobre subdominio+dominio |
| `PAIN_WEB_INCLUDE_PORT` | `0` | `1` agrega `:10022` a la URL derivada |
| `PAIN_WEB_BRAND` | `Pain Bot` | Nombre visible en el panel |
| `PAIN_WEB_ADMIN_USER` | `admin` | Usuario administrador inicial |
| `PAIN_WEB_ADMIN_PASS` | vac├¡o | Contrase├▒a del administrador inicial |
| `PAIN_WEB_ADMIN_RESET` | `0` | `1` restablece la contrase├▒a del admin al arrancar |
| `PAIN_WEB_ALLOW_REGISTER` | `1` | `0` cierra el registro p├║blico |
| `PAIN_WEB_REQUIRE_INVITE` | `0` | `1` exige c├│digo de invitaci├│n |
| `PAIN_WEB_INVITE` | vac├¡o | C├│digo de invitaci├│n |
| `PAIN_WEB_TRUST_PROXY` | `1` | `0` ignora `X-Forwarded-For` |
| `PAIN_WEB_MAIN_WAIT` | `25000` | Espera (ms) a que el socket del principal abra antes de pedir el c├│digo |
| `PAIN_WEB_SESSION_TTL` | `604800000` | Duraci├│n de la sesi├│n web (ms) |
| `PAIN_WEB_PAIR_TTL` | `180000` | Vida del intento de vinculaci├│n (ms) |
| `PAIN_WEB_CODE_TTL` | `90000` | Vida del c├│digo de 8 d├¡gitos (ms) |
| `PAIN_WEB_MAX_LINKS_HOUR` | `8` | Intentos por usuario/hora |
| `PAIN_WEB_MAX_LINKS_DAY` | `30` | Intentos por usuario/d├¡a |
| `PAIN_WEB_MAX_LINKS_IP_HOUR` | `20` | Intentos por IP/hora |
| `PAIN_WEB_PAIR_COOLDOWN_MS` | `30000` | Espera entre c├│digos del mismo n├║mero (ms) |

Si `PAIN_WEB_ADMIN_PASS` queda vac├¡o, al primer arranque se genera una
contrase├▒a aleatoria y se escribe en `storage/webpanel-admin.txt`. Para
recuperar el acceso, define `PAIN_WEB_ADMIN_PASS` y `PAIN_WEB_ADMIN_RESET=1`
una vez, y luego quita `PAIN_WEB_ADMIN_RESET`.

### D├│nde van las credenciales

**No escribas contrase├▒as dentro de `config.js`.** Ese archivo se versiona y
terminar├¡a compartido con el repositorio. El panel lee la contrase├▒a de
`PAIN_WEB_ADMIN_PASS`; si no la defines, genera una y la guarda aparte.

La prioridad es:

1. Variables reales del proceso (Pterodactyl ÔåÆ **Startup ÔåÆ Environment**).
2. Archivo `.env` local (opcional).
3. Valores por defecto de `config.js`.

En producci├│n con Pterodactyl configura las credenciales en las variables de
arranque del servidor. En local puedes copiar el ejemplo:

```bash
cp .env.example .env
chmod 600 .env
# Edita .env y define PAIN_WEB_ADMIN_PASS
```

`.env` ya est├í en `.gitignore`; `.env.example` solo contiene valores de
ejemplo y s├¡ se puede subir. Nunca subas el `.env` real ni
`storage/webpanel-admin.txt`.

### Seguridad

- La contrase├▒a del panel se guarda con **scrypt + salt** en
  `storage/webpanel.sqlite`; no se guarda en texto plano.
- `storage/webpanel-admin.txt` contiene la contrase├▒a generada en texto plano.
  C├│piala a tu gestor de contrase├▒as y b├│rrala; el archivo se crea con permisos
  `0600`.
- Usa HTTPS en producci├│n. La cookie de sesi├│n es `HttpOnly`, `SameSite=Lax` y
  `Secure` cuando la URL p├║blica es `https://`.
- Las mutaciones exigen token CSRF y validan el origen. El login y la
  vinculaci├│n tienen l├¡mites por usuario/IP.
- No publiques el puerto `10022` directamente a Internet: exp├│n solo el
  reverse proxy HTTPS.
- El panel sirve ├║nicamente archivos de `webpanel/public`. Las credenciales de
  WhatsApp viven en `Serbot/<n├║mero>/` y no se sirven por HTTP.
- Si un atacante obtiene acceso al sistema de archivos o al panel de
  Pterodactyl, puede leer `.env`, `storage/` y `Serbot/`. Por eso importan los
  permisos del servidor, las copias de seguridad y no reutilizar contrase├▒as.

### DNS y reverse proxy

Configura el subdominio para que apunte al nodo y publica el puerto del panel
detr├ís de HTTPS:

1. En Pterodactyl, habilita la allocation **10022** para el servidor.
2. Crea un registro DNS `A` para `pain.nexcodea.com` apuntando a
   `node.nexcodea.com` (o al mismo balanceador/proxy que usan los dem├ís
   servicios del nodo).
3. Publica `pain.nexcodea.com` por HTTPS y env├¡a el tr├ífico a
   `http://IP_DEL_NODO:10022` con `Host` y `X-Forwarded-*`.

Ejemplo de Nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name pain.nexcodea.com;

  # ssl_certificate ... / ssl_certificate_key ...

  location / {
    proxy_pass http://127.0.0.1:10022;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Con HTTPS, la cookie de sesi├│n se marca `Secure` autom├íticamente. Si accedes
directamente sin proxy, define la URL exacta para evitar confusiones:

```env
PAIN_WEB_PUBLIC_URL=http://pain.nexcodea.com:10022
```

`https://pain.nexcodea.com` (sin puerto) es el valor recomendado cuando hay
reverse proxy, que es el caso normal en producci├│n.

### Primer acceso

1. Arranca el bot principal y abre la URL p├║blica del panel.
2. Entra con el usuario/contrase├▒a administrador.
3. Revisa **Ajustes** para el l├¡mite de plazas y **Usuarios** para crear o
   moderar cuentas.
4. Cada usuario entra a **Vincular bot**, escribe su n├║mero con c├│digo de pa├¡s
   y recibe un c├│digo de 8 caracteres. Lo confirma en WhatsApp ÔåÆ Dispositivos
   vinculados ÔåÆ Vincular con n├║mero.
5. El panel muestra el estado en **Mis bots**; la vinculaci├│n aparece en el
   panel de administraci├│n con su auditor├¡a.

El emparejamiento usa el mismo motor de Baileys que `/code`, pero el c├│digo se
genera aleatorio para cada intento y nunca se comparte entre sesiones.
