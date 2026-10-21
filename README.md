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

Bot de WhatsApp multi-dispositivo (Baileys). Descargas, IA, administración de grupos, RPG, stickers y más.

SQLite usa un módulo nativo que debe instalarse para el sistema operativo del servidor.
Sharp también necesita su runtime opcional para la plataforma. No copies `node_modules`
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
| **Hosting** | [NexCodea — hosting para bot barato](https://clientes.nexcodea.com/) |
| **Runtime** | Node.js 20.17+ |
| **Dependencias** | Instalar en el sistema operativo donde correrá el bot |
| **Licencia** | GPL-3.0-or-later |

---

## Índice

1. [Requisitos](#requisitos)
2. [Inicio rápido](#inicio-rápido)
3. [Termux](#termux)
4. [Vincular cuenta](#vincular-cuenta)
5. [PM2 en Termux](#pm2-en-termux)
6. [Configuración](#configuración)
7. [Uso](#uso)
8. [Estructura](#estructura)
9. [Actualizar](#actualizar)
10. [Panel web](#panel-web)
11. [Problemas frecuentes](#problemas-frecuentes)
12. [Aviso y créditos](#aviso-y-créditos)

---

## Requisitos

| Componente | Detalle |
|------------|---------|
| Node.js | 20.17 o superior |
| Git | versión reciente |
| FFmpeg | recomendado (audio, video, stickers) |
| npm | instala los módulos nativos para la plataforma actual |

No reutilices `node_modules` instalado en otro sistema operativo: incluye el binario
nativo de SQLite y debe corresponder a Linux, Windows o Termux donde se ejecutará.

---

## Inicio rápido

Windows, Linux o macOS:

```bash
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

`npm install` prepara las dependencias y el módulo nativo SQLite para este sistema.
Al iniciar, `npm start` valida que Sharp pueda procesar una imagen. Si falta el runtime,
instala las dependencias opcionales de la plataforma (incluido Linux x64 en Pterodactyl);
si la instalación falla, detiene el arranque y muestra el error en vez de dejar que fallen
los plugins de imágenes durante su recarga.

En Debian/Ubuntu, si te falta FFmpeg:

```bash
sudo apt update
sudo apt install -y ffmpeg git
```

El comando `npm start` comprueba el módulo nativo `sqlite3` y fija la versión 5.1.7 para
evitar que una actualización descargue el binario 6.x incompatible con la GLIBC
de algunos contenedores. Si el precompilado de la plataforma no sirve, compila
SQLite desde el código fuente local y muestra el diagnóstico completo si falla.
Si necesitas repetir la comprobación manualmente:

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

Instala las dependencias en Termux para compilar/seleccionar los módulos nativos:

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

El método principal de vinculación es por **código de 8 dígitos** (pairing code). No hace falta escanear QR.

### Arranque

```bash
cd pain-bot   # o: cd ~/pain-bot en Termux
npm start
```

### Pasos en la terminal

1. Cuando pregunte el método de sesión, escribe:

```text
code
```

2. Ingresa el número del WhatsApp que usará el bot, **con código de país y sin símbolos**:

```text
51999999999
```

3. La terminal mostrará un código de **8 caracteres** (ej. `ABCD-EFGH`).

### Pasos en WhatsApp (teléfono)

1. Abre WhatsApp en el dispositivo del número indicado  
2. **Ajustes → Dispositivos vinculados → Vincular un dispositivo**  
3. Elige **Vincular con número de teléfono**  
4. Escribe el código de 8 dígitos que salió en la terminal  

La sesión se guarda en `Sessions/`. Conserva esa carpeta si no quieres volver a vincular.

> Tip: la primera vinculación hazla con `npm start` en primer plano para copiar el código con calma. Después puedes pasar a PM2.

Detener el proceso: `Ctrl + C`.

---

## PM2 en Termux

Para mantener el bot en segundo plano sin dejar la terminal abierta:

```bash
npm install -g pm2
cd ~/pain-bot
```

**Importante:** vincula primero con `npm start` y el código. Cuando la sesión ya esté en `Sessions/`:

```bash
pm2 start index.js --name painbot
pm2 save
```

| Comando | Acción |
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

Desactiva la optimización de batería para Termux en Android; si no, el sistema puede matar el proceso.

---

## Configuración

Edita `config.js` (mejor con el bot detenido al cambiar owners):

| Variable | Descripción |
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

Sin `+`, espacios ni guiones en el número.

---

## Uso

Prefijo por defecto: `.`

```text
.menu
.menu2
.play nombre de canción
.video búsqueda o enlace
.ia mensaje
.s
```

Más comandos en `.menu` / `.menu2` dentro del chat.

---

## Estructura

```text
pain-bot/
├── config.js         Configuración global
├── index.js          Entrada
├── main.js           Conexión y ciclo
├── handler.js        Mensajes y comandos
├── plugins/          Comandos (hot reload)
├── lib/              Utilidades y modos
├── node_modules/     Dependencias instaladas para esta plataforma
├── storage/          Datos persistentes
├── Sessions/         Sesión de WhatsApp (no versionar)
└── package.json
```

Los plugins suelen recargarse al guardar. Si no aparece uno nuevo, reinicia con `npm start` o `pm2 restart painbot`.

Solo existe `/pri 1`: el bot principal tiene su proceso y todos los sub-bots
comparten un único worker. `/pri 2` fue retirado y cualquier modo antiguo
guardado se ignora. El procesamiento de imágenes usa un hilo libvips por
operación por defecto; puedes ajustar ese límite con `PAIN_SHARP_CONCURRENCY`.

---

## Actualizar

```bash
cd pain-bot
git pull origin main
npm install
npm start
# o: pm2 restart painbot
```

Ejecuta `npm install` también después de actualizar: el módulo nativo de SQLite
debe coincidir con la plataforma del servidor.

Haz backup de `Sessions/` y de tu `config.js` antes de un `git pull` si tocaste owners o APIs.

---

## Problemas frecuentes

**No sale el código de vinculación**  
Escribe `code` (no `qr`) cuando pregunte el método. Cierra otras instancias del bot y vuelve a `npm start`.

**El código expira o no se acepta**  
Pide uno nuevo reiniciando. En WhatsApp usa *Vincular con número de teléfono*, no el escáner de cámara.

**Error de módulos / “Cannot find module”**  
Instala las dependencias para la plataforma actual:

```bash
# PC
npm install

# Termux
npm install --no-bin-links
```
**Sesión cerrada / logged out**

```bash
rm -rf Sessions
npm start
```

Vuelve a vincular con el código de 8 dígitos.

**El bot no responde en un grupo**  
Revisa si está desactivado, silenciado o si faltan permisos de admin para comandos de grupo.

**Termux se cierra solo**  
Ajustes de Android → sin optimización de batería para Termux.

---

## Aviso y créditos

Uso personal o educativo. Respeta las [políticas de WhatsApp](https://www.whatsapp.com/legal) y la ley de tu país. El uso indebido de automatización puede banear la cuenta vinculada; conviene un número secundario.

| | |
|---|---|
| **Proyecto** | Pain Bot |
| **By** | Sunkovv |
| **Núcleo** | [Baileys](https://github.com/WhiskeySockets/Baileys) (WhiskeySockets) |
| **Repositorio** | https://github.com/nexusday/pain-bot.git |

---

*Pain Bot — By Sunkovv*
# Sub-bot process layout

The main bot runs in its own process. Sub-bots are split across several
supervised workers (5 by default, `PAIN_SUBBOT_WORKERS`).
`/pri 2` and per-sub-bot worker mode have been removed to keep process count and
CPU overhead predictable.

**Los sub-bots esperan al principal.** Si el bot principal no tiene sesión
registrada (estás emparejando con un código de 8 dígitos), los workers de
sub-bots no arrancan: no se conecta nada hasta que termines el emparejamiento.
En cuanto el principal queda vinculado, los sub-bots arrancan solos. Después de
eso la compuerta ya no interviene: si el principal se desvincula más tarde, los
sub-bots **siguen conectados y funcionando**.

**`/subme <mensaje>`** no lo manda el principal a los sub-bots: **cada sub-bot
se escribe a sí mismo** el mensaje (en su propio chat "mensajes para ti
mismo"). Ni el principal les escribe a los sub-bots, ni los sub-bots se
escriben entre sí, y **el principal no contesta nada** (tampoco una
confirmación): solo reparte la orden.

---

# Memoria con muchos sub-bots

Con 150+ sub-bots la RAM la consuma el proceso, no el bot. Por eso ahora:

- Se podan por proceso los chats inactivos (150 por socket), la metadata de
  grupos (60 por socket) y el caché de mensajes (4 000 por proceso, 50 por chat).
- Se quitan las miniaturas (jpeg/png) de los mensajes cacheados: eran el bloque
  más pesado y ningún comando las usaba.
- Se libera el modelo de voz (Whisper) tras 5 min sin audio y se ejecuta GC
  cuando el heap supera 350 MB.
- Se limita el heap de cada proceso: 896 MB por worker y 1 GB para el principal.
  Si un worker se pasa, el supervisor lo reinicia solo.

Diagnóstico: `/mem` y `/mem limpiar` (fuerza poda y GC en el proceso actual).

| Variable | Por defecto | Para qué |
|---|---|---|
| `PAIN_SUBBOT_WORKERS` | `5` | Cuántos workers reparten los sub-bots |
| `PAIN_WORKER_HEAP_MB` | `896` | Tope de heap por worker |
| `PAIN_PRIMARY_HEAP_MB` | `1024` | Tope de heap del proceso principal |
| `PAIN_MAX_CHATS_SOCKET` | `150` | Chats guardados por socket |
| `PAIN_MAX_GROUP_META` | `400` | Metadata de grupos en caché por proceso |
| `PAIN_MAX_MSG_CACHE` | `4000` | Mensajes cacheados por proceso |
| `PAIN_MAX_MSG_CHAT` | `50` | Mensajes cacheados por chat |
| `PAIN_GROUP_META_TTL_MS` | `1800000` | Antigüedad máxima de la metadata de un grupo |
| `PAIN_GC_MIN_MB` | `350` | Heap a partir del cual se fuerza GC |
| `PAIN_RSS_ALERT_MB` | `1200` | RSS del proceso que activa la poda agresiva |
| `PAIN_STT_IDLE_MS` | `300000` | Tiempo sin audio para descargar el modelo de voz |
| `PAIN_MAX_IA_CHATS` | `300` | Chats con memoria de IA por proceso |

---

## Panel web

El proceso principal del bot levanta un panel HTTP para registrar cuentas y
vincular sub-bots desde el navegador. Los workers de sub-bots **nunca** abren
el puerto: solo escucha el proceso principal.

- Puerto por defecto: **`10022`** (`global.webPanel.port` o `PAIN_WEB_PORT`).
- Host: `0.0.0.0`, para que Pterodactyl pueda enrutar la allocation.
- Base de datos propia: `storage/webpanel.sqlite`. No se mezcla con la base
  caliente del bot (`storage/databases/database.sqlite`).
- Las sesiones de WhatsApp siguen en `Serbot/<número>/`; mientras se vinculan
  llevan un archivo `.pairing` para que el supervisor no las conecte, archive
  ni purge a mitad del proceso.
- El bot principal debe estar vinculado antes de generar códigos desde la web.
  Si no lo está, el panel responde `main_not_linked`.

### Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PAIN_WEB_ENABLED` | `1` | `0` apaga el panel sin tocar el bot |
| `PAIN_WEB_PORT` | `10022` | Puerto de la allocation |
| `PAIN_WEB_HOST` | `0.0.0.0` | Interfaz de escucha |
| `PAIN_WEB_SUBDOMAIN` | `pain` | Subdominio público |
| `PAIN_WEB_DOMAIN` | `nexcodea.com` | Dominio base |
| `PAIN_WEB_PUBLIC_URL` | derivada | URL pública completa; manda sobre subdominio+dominio |
| `PAIN_WEB_INCLUDE_PORT` | `0` | `1` agrega `:10022` a la URL derivada |
| `PAIN_WEB_BRAND` | `Pain Bot` | Nombre visible en el panel |
| `PAIN_WEB_ADMIN_USER` | `admin` | Usuario administrador inicial |
| `PAIN_WEB_ADMIN_PASS` | vacío | Contraseña del administrador inicial |
| `PAIN_WEB_ADMIN_RESET` | `0` | `1` restablece la contraseña del admin al arrancar |
| `PAIN_WEB_ALLOW_REGISTER` | `1` | `0` cierra el registro público |
| `PAIN_WEB_REQUIRE_INVITE` | `0` | `1` exige código de invitación |
| `PAIN_WEB_INVITE` | vacío | Código de invitación |
| `PAIN_WEB_TRUST_PROXY` | `1` | `0` ignora `X-Forwarded-For` |
| `PAIN_WEB_SESSION_TTL` | `604800000` | Duración de la sesión web (ms) |
| `PAIN_WEB_PAIR_TTL` | `180000` | Vida del intento de vinculación (ms) |
| `PAIN_WEB_CODE_TTL` | `90000` | Vida del código de 8 dígitos (ms) |
| `PAIN_WEB_MAX_LINKS_HOUR` | `8` | Intentos por usuario/hora |
| `PAIN_WEB_MAX_LINKS_DAY` | `30` | Intentos por usuario/día |
| `PAIN_WEB_MAX_LINKS_IP_HOUR` | `20` | Intentos por IP/hora |

Si `PAIN_WEB_ADMIN_PASS` queda vacío, al primer arranque se genera una
contraseña aleatoria y se escribe en `storage/webpanel-admin.txt`. Para
recuperar el acceso, define `PAIN_WEB_ADMIN_PASS` y `PAIN_WEB_ADMIN_RESET=1`
una vez, y luego quita `PAIN_WEB_ADMIN_RESET`.

### DNS y reverse proxy

Configura el subdominio para que apunte al nodo y publica el puerto del panel
detrás de HTTPS:

1. En Pterodactyl, habilita la allocation **10022** para el servidor.
2. Crea un registro DNS `A` para `pain.nexcodea.com` apuntando a
   `node.nexcodea.com` (o al mismo balanceador/proxy que usan los demás
   servicios del nodo).
3. Publica `pain.nexcodea.com` por HTTPS y envía el tráfico a
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

Con HTTPS, la cookie de sesión se marca `Secure` automáticamente. Si accedes
directamente sin proxy, define la URL exacta para evitar confusiones:

```env
PAIN_WEB_PUBLIC_URL=http://pain.nexcodea.com:10022
```

`https://pain.nexcodea.com` (sin puerto) es el valor recomendado cuando hay
reverse proxy, que es el caso normal en producción.

### Primer acceso

1. Arranca el bot principal y abre la URL pública del panel.
2. Entra con el usuario/contraseña administrador.
3. Revisa **Ajustes** para el límite de plazas y **Usuarios** para crear o
   moderar cuentas.
4. Cada usuario entra a **Vincular bot**, escribe su número con código de país
   y recibe un código de 8 dígitos. Lo confirma en WhatsApp → Dispositivos
   vinculados → Vincular con número.
5. El panel muestra el estado en **Mis bots**; la vinculación aparece en el
   panel de administración con su auditoría.

El emparejamiento usa el mismo motor de Baileys que `/code`, pero el código se
genera aleatorio para cada intento y nunca se comparte entre sesiones.
