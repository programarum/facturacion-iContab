# iContab - Sistema de Facturacion

Aplicación de escritorio construida con **Tauri 2** (React + Vite + Rust) y base de datos **SQLite embebida**. La facturación e inventario funcionan localmente, sin Python ni servidor de datos; la licencia de producción puede validar por internet mediante el servicio separado descrito abajo.

La aplicación está dirigida a **producción en Windows**. Linux se utiliza para desarrollo y pruebas. Genera facturas fiscales colombianas (IVA 19%, CUFE y QR) y permite imprimir/guardar las facturas como PDF.

## Requisitos

- [Node.js](https://nodejs.org/) LTS y [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) con toolchain estable
- Dependencias del sistema para Tauri (Linux):

```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  patchelf xdg-utils
```

## Puesta en marcha (desarrollo)

### 1. Instalar dependencias del frontend

```bash
pnpm install
```

### 2. Ejecutar en modo desarrollo

```bash
pnpm tauri:dev
```

Esto inicia Vite y la ventana de Tauri con el backend Rust incluido. Las credenciales de prueba se siembran en la primera ejecucion: `admin` / `Admin123!`.

### Scripts utiles

| Comando | Descripcion |
| --- | --- |
| `pnpm dev` | Solo Vite (frontend) |
| `pnpm build` | Compila el frontend |
| `pnpm lint` | Ejecuta ESLint |
| `pnpm tauri:dev` | Ejecuta la app en modo desarrollo |
| `pnpm tauri:dev:demo` | Desarrollo con datos de demostración (Tienda Mixta) |
| `pnpm tauri:build` | Genera el binario para el OS actual |
| `pnpm tauri:build:windows` | Instalador **normal** Windows x64 |
| `pnpm tauri:build:windows:demo` | Instalador **demo** Windows x64 |

## Generacion de PDF

La seccion de Facturacion incluye un boton **"Descargar PDF"** tras crear una factura. El PDF se genera 100% en el navegador (jsPDF) e incluye: datos de la empresa, datos del cliente, items con IVA, totales, resolucion DIAN y CUFE. Funciona identico en Linux y Windows y se guarda/imprime desde el visor de PDF del sistema.

## Impresion nativa (Windows)

La impresion termica ESC/POS nativa (listado de impresoras via PowerShell y envio via `print`/`notepad`) sigue disponible **solo en Windows**, protegida por compilacion condicional. En Linux, la app lista impresoras via CUPS (`lpstat`) y envia tickets con `lp`, o bien guarda el ticket como archivo (modo "pdf").

## Build normal vs. build de demostración

El mismo código produce dos builds distintos, controlados por el *feature* Cargo `demo`:

| | Build **normal** (sin `demo`) | Build **demo** (`--features demo`) |
| --- | --- | --- |
| Datos iniciales | Genéricos (empresa de ejemplo + catálogo de prueba) | "Tienda Mixta La Esquina" (comidas + frutas/verduras + abarrotes, clientes, mermas y facturas de ejemplo) |
| Licencia (Windows) | La exige | No la exige |
| Vigencia | Permanente (licencia por equipo) | **15 días** desde el primer arranque |
| Código del demo | **No se incluye** (ni textos, ni contacto, ni comando) | Incluido |
| Identidad | `icontab-facturacion` / `com.icontab-facturacion.dev` | `icontab-facturacion-demo` / `com.icontab-facturacion.demo` |

Como la identidad (y por tanto la carpeta de datos) es distinta, demo y normal **se pueden instalar en el mismo equipo** sin pisarse.

> El instalador **normal** se compila sin el feature `demo`: el módulo de vencimiento
> y el comando `obtener_estado_demo` no existen en el binario, y en el frontend Vite
> resuelve `@demo` a un stub vacío (ver `vite.config.js`). Por eso, al instalar a un
> cliente con licencia **no queda ningún rastro de la demostración**.

### Validación automática de coherencia (normal ↔ demo)

Para que nunca se mezclen los dos builds:

1. `pnpm build` y `pnpm build:demo` ejecutan `scripts/verificar-build.mjs`, que
   inspecciona el bundle final:
   - el build **normal** falla si encuentra código del demo;
   - el build **demo** falla si **no** lo encuentra.
   Además deja la marca `dist/.modo-build` (`normal` o `demo`).
2. `src-tauri/build.rs` compara esa marca con el feature `demo` de Rust:
   - en **release** (instaladores) una incoherencia **aborta la compilación** con un mensaje claro;
   - en **debug** solo muestra un `cargo:warning`.

Así es imposible publicar un instalador "limpio" con restos del demo, o un demo
sin su backend de vencimiento.

> La demo **no** sustituye al producto: es una compilación aparte. El build normal se hace **como siempre** (`pnpm tauri:build:windows`).

### Vigencia de la demo (15 días)

El build demo vence **15 días después de su primer arranque** en el equipo. Al
cumplirse el plazo, la app muestra la pantalla "La demostración ha finalizado" y
no permite continuar.

**Marca anti-reinstalación.** La fecha de inicio (`demo_inicio.json`) se guarda en
varias rutas **fijas del sistema**, fuera de la carpeta de datos de la app. En cada
arranque se leen todas y se toma la **más antigua**, de modo que borrar los datos o
reinstalar la aplicación no reinicia el conteo:

| Sistema | Rutas de la marca |
| --- | --- |
| Windows | `%PROGRAMDATA%\iContab\demo_inicio.json`, `%LOCALAPPDATA%\iContab\demo_inicio.json`, `%APPDATA%\iContab\demo_inicio.json` |
| Linux / macOS | `$XDG_CONFIG_HOME/icontab/demo_inicio.json`, `~/.config/icontab/demo_inicio.json`, `~/.icontab/demo_inicio.json` |
| Ambos | `<carpeta de datos de la app>/demo_inicio.json` (compatibilidad) |

**Aviso y contacto.** El navbar muestra en todo momento los días restantes
(`⏳ Demo: 12 días`), que cambia a color ámbar cuando quedan **3 días o menos** y
abre el WhatsApp **321 688 2631** al hacer clic. Al vencer, la pantalla de bloqueo
muestra el mismo contacto ("contáctenos").

- Solo aplica al build `demo`; el build normal **no compila** el módulo ni registra el comando, así que no hay nada que desactivar.
- Es una medida **disuasiva** (sencilla), no un DRM: alguien con conocimientos podría borrar las marcas. Para un candado más fuerte se puede migrar a una licencia de demo firmada con fecha de expiración.
- Si se recompila y se cambia el nombre del producto/carpeta, ajustar `CARPETA_MARCA` en `src-tauri/src/demo.rs`.
- Para cambiar la duración: editar `DEMO_DIAS` en `src-tauri/src/demo.rs`.

### Compilar la demo para Windows x64

```powershell
pnpm install
pnpm tauri:build:windows:demo
# Salida: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
```

No requiere `ICONTAB_LICENSE_PUBLIC_KEY` (la demo omite la licencia). En desarrollo local: `pnpm tauri:dev:demo`.

## Generar el instalador de Windows

Tauri permite compilar para Windows con toolchain MSVC. El script local genera instaladores para **x64 y x86 (32 bits)**; el workflow de GitHub Actions de este proyecto genera actualmente **x64**.

### Opcion A: GitHub Actions (recomendada, sin PC con Windows)

Hay un workflow en `.github/workflows/build-windows.yml`. Activalo desde la pestana **Actions** de tu repositorio con `Build Windows` > *Run workflow*, o crea un tag `v*`. Los instaladores `.exe` (NSIS) y `.msi` (WiX) quedan disponibles como artifact.

Antes, configura `ICONTAB_LICENSE_PUBLIC_KEY` en los secretos del repositorio; `ICONTAB_LICENSE_SERVER_URL` es opcional.

### Opcion B: en una maquina con Windows

```powershell
# Mantén estas variables en la misma ventana de PowerShell durante cada build.
$env:ICONTAB_LICENSE_PUBLIC_KEY = "<clave-publica-base64>"
Remove-Item Env:ICONTAB_LICENSE_SERVER_URL -ErrorAction SilentlyContinue
pnpm install
pnpm tauri:build:windows       # MSI x64
pnpm tauri:build:windows:x86   # MSI x86 (32 bits)
# Salidas: src-tauri/target/<target>/release/bundle/
```

### Opcion C: transferir un paquete desde otro equipo

Desde la carpeta del proyecto, crea un ZIP liviano con el código fuente y los scripts de Windows:

```bash
python3 scripts/pack-windows.py
```

Por defecto genera `icontab-facturacion-windows.zip` junto a la carpeta del proyecto. Excluye dependencias instaladas, compilaciones previas, cachés de Rust y archivos locales de claves o configuración `.env`.

En Windows, instala Node.js LTS, pnpm, Rust estable con la toolchain MSVC, Visual Studio Build Tools (C++ con herramientas x86 y x64), WebView2 y los empaquetadores de Tauri requeridos (NSIS/WiX). Extrae el ZIP, abre PowerShell en la carpeta extraída, configura la clave pública de compilación y ejecuta el script incluido:

```powershell
$env:ICONTAB_LICENSE_PUBLIC_KEY = "<clave-publica-base64>"
Remove-Item Env:ICONTAB_LICENSE_SERVER_URL -ErrorAction SilentlyContinue
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

El script instala dependencias con el lockfile, prepara `x86_64-pc-windows-msvc` e `i686-pc-windows-msvc` y compila ambos instaladores con la misma clave pública de licencia. La URL del servidor es opcional; la clave privada nunca se necesita en el equipo de compilación ni debe incluirse en el ZIP.

### Nota sobre cross-compilation desde Linux

La compilación cruzada de targets Windows MSVC desde Linux no es la vía recomendada para este proyecto. La opción fiable es **Opcion A** (GitHub Actions con `windows-latest`) para x64 o **Opcion B/C** en una máquina Windows para generar x64 y x86.

## Compilar y actualizar Windows paso a paso (x64 y x86)

### 1. Obtener o recuperar la clave pública

Genera un par solo la primera vez y guarda ambas líneas que imprime `--generate-keypair` en un lugar seguro:

```powershell
cargo run --release --manifest-path license-server/Cargo.toml -- --generate-keypair
```

Si ya tienes la clave privada pero perdiste la pública, **no generes otro par**. Recupera la pública correspondiente así:

```powershell
$env:ICONTAB_LICENSE_PRIVATE_KEY = "<pega-aqui-tu-clave-privada-base64-guardada>"
cargo run --release --manifest-path license-server/Cargo.toml -- --print-public-key
Remove-Item Env:ICONTAB_LICENSE_PRIVATE_KEY
```

Copia solo el valor después de `ICONTAB_LICENSE_PUBLIC_KEY=`. `--generate-keypair` crea un par nuevo; volver a ejecutarlo haría que las licencias ya emitidas no coincidan con la nueva clave pública.

### 2. Compilar los instaladores

Abre PowerShell en la carpeta del proyecto. La clave pública es de compilación y las variables `$env:...` solo duran en esa ventana; configura la clave antes de cada build. Comprueba que esté presente y que decodifique a 32 bytes sin mostrarla:

```powershell
$env:ICONTAB_LICENSE_PUBLIC_KEY = "<pega-aqui-la-clave-publica-base64>"
Remove-Item Env:ICONTAB_LICENSE_SERVER_URL -ErrorAction SilentlyContinue
if ([string]::IsNullOrWhiteSpace($env:ICONTAB_LICENSE_PUBLIC_KEY)) { throw "Falta la clave pública" }
if ([Convert]::FromBase64String($env:ICONTAB_LICENSE_PUBLIC_KEY).Length -ne 32) { throw "La clave pública no es válida" }

# MSI x64
pnpm tauri:build:windows

# MSI x86 (32 bits), si también lo distribuyes
pnpm tauri:build:windows:x86
```

Para generar ambos instaladores con un solo script usa `powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1`. Las compilaciones de x86 y x64 deben recibir **la misma clave pública**.

### 3. Preparar la actualización MSI offline

Antes de compilar una nueva versión, incrementa a un valor superior la versión de `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`; conserva el mismo `identifier` y la misma clave pública. Cargo reutilizará sus dependencias compiladas si permanecen en `src-tauri/target`.

Después de compilar el target que coincida con la instalación del cliente, empaqueta su MSI:

```powershell
# Para la instalación MSI x64
powershell -ExecutionPolicy Bypass -File .\scripts\package-offline-update.ps1 -Architecture x64

# Para la instalación MSI x86 de 32 bits
powershell -ExecutionPolicy Bypass -File .\scripts\package-offline-update.ps1 -Architecture x86
```

El paquete `icontab-facturacion-update-<version>-<arquitectura>.zip` se crea junto a la carpeta del proyecto. Copíalo por USB al computador destino, extráelo y ejecuta `powershell -ExecutionPolicy Bypass -File .\apply-offline-update.ps1`. El asistente MSI se muestra; antes, el script verifica el hash y respalda la base de datos y la licencia en `%LOCALAPPDATA%\iContab\update-backups`.

Usa x64 sobre una instalación x64 y x86 sobre una instalación x86. Windows de 32 bits no puede instalar el MSI x64. El equipo actualizado no necesita conexión a internet ni herramientas de desarrollo. La licencia sigue siendo por huella de equipo, no por arquitectura.

## Base de datos

La base de datos **se inicializa sola** al arrancar la aplicacion, tanto en Linux como en Windows. No tienes que crear nada manualmente:

1. Cuando la app inicia, Rust abre la base de datos SQLite y crea las tablas si no existen.
2. Un seed inicial **siembra datos de ejemplo** la primera vez: usuarios (`admin`/`Admin123!`), configuracion de la empresa, categorias y 5 productos de prueba.

### Donde se guarda la base de datos

Se guarda en el directorio de datos de la aplicacion Tauri (`app_data_dir()`), que cambia segun el sistema operativo:

| Sistema | Ruta |
| --- | --- |
| Windows | `C:\Users\<usuario>\AppData\Local\com.icontab-facturacion.dev\facticontab.db` |
| Linux | `~/.local/share/com.icontab-facturacion.dev/facticontab.db` |

## Como ingresar los productos

Entra con el usuario `admin` y ve a la pagina **Productos** y **Categorias**. Ahí puedes crear, editar y eliminar productos y categorias manualmente.

### Importar desde Excel

En **Productos**, selecciona **Importar Excel** y revisa las filas antes de guardar. Se aceptan archivos `.xlsx`, `.xls` y `.csv` de hasta 20 MB, con un máximo de 5000 productos por carga. Las columnas requeridas son `codigo`, `nombre`, `precio` y `stock_actual`; también se reconocen `COSTO`, `stock_minimo` y `UBICACION`.

Las filas sin categoría se asignan a **Importados**. Las filas sin unidad se proponen como **unidad**; cambia a kg, g, L o ml los productos vendidos por medida en la vista previa. Se conservan códigos de texto con ceros iniciales, como `009`. Los códigos que ya estén en el catálogo se omiten sin modificar sus datos. El stock inicial importado queda registrado como movimiento de entrada.

## Respaldos automáticos

Un administrador puede seleccionar la carpeta desde **Configuración**. La aplicación genera una copia SQLite consistente al iniciar, conserva las **30 más recientes** y permite crear una copia manual desde esa misma pantalla. Si la carpeta no está disponible, la aplicación informa el problema y continúa usando la base original.

## Licencias por equipo (producción Windows)

La edición de producción para Windows requiere una licencia firmada y ligada al identificador del equipo. La firma Ed25519 se verifica localmente y permite trabajar sin conexión. En la modalidad inicial sin servidor, las licencias se emiten manualmente como archivos JSON y se importan desde la pantalla de activación.

Linux y las compilaciones de desarrollo omiten la licencia. El build de producción requiere `ICONTAB_LICENSE_PUBLIC_KEY`; `ICONTAB_LICENSE_SERVER_URL` es opcional y habilita activación y validación online. La clave privada nunca se incluye en el instalador, en el ZIP del proyecto ni en el repositorio.

### Crear las claves de firma

En una máquina segura genera el par una sola vez y guarda ambas claves en un lugar protegido:

```bash
cargo run --release --manifest-path license-server/Cargo.toml -- --generate-keypair
```

La clave pública se usa al compilar Windows. La privada se usa únicamente desde el equipo seguro que emite licencias. Conserva una copia de respaldo protegida; rotarla requiere recompilar con la nueva clave pública y volver a emitir licencias.

### Emitir una licencia offline

El cliente abre iContab, copia la huella del equipo que muestra **Activar este equipo** y te la envía. En la máquina segura, carga temporalmente la clave privada y crea un archivo firmado:

```powershell
$env:ICONTAB_LICENSE_PRIVATE_KEY = "<clave-privada-base64>"
cargo run --release --manifest-path license-server/Cargo.toml -- --issue-license "<huella-de-64-caracteres>" ".\licencias\cliente-001.json"
Remove-Item Env:ICONTAB_LICENSE_PRIVATE_KEY
```

Entrega el JSON al cliente para que use **Importar archivo de licencia offline**. El emisor crea un identificador nuevo y no sobrescribe archivos existentes.

Las licencias emitidas offline son permanentes y no se revocan automáticamente. Cambiar o reemplazar el equipo requiere emitir otro archivo para su nueva huella. Para usarlas no hace falta desplegar el servidor ni pagar hosting.

### Servidor online opcional

Si más adelante quieres automatizar activaciones, puedes desplegar el servicio detrás de HTTPS. Requiere `ICONTAB_LICENSE_PRIVATE_KEY`, `ICONTAB_LICENSE_ADMIN_TOKEN` (mínimo 32 caracteres) y una base persistente indicada por `ICONTAB_LICENSE_DB`.

```bash
cargo run --release --manifest-path license-server/Cargo.toml
```

El servidor escucha en `127.0.0.1:8787` por defecto. Los endpoints administrativos requieren `Authorization: Bearer <ICONTAB_LICENSE_ADMIN_TOKEN>`.

Crear una licencia administrativa:

```bash
curl -X POST "$ICONTAB_LICENSE_SERVER_URL/admin/licenses" \
  -H "Authorization: Bearer $ICONTAB_LICENSE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Cliente 001"}'
```

Para activación online, envía la `license_key` y la huella a `POST /v1/activate`. Para transferir una licencia, reinicia la asociación con `POST /admin/licenses/{license_id}/reset-device`; para revocarla, usa `POST /admin/licenses/{license_id}/revoke`.

### Compilar el instalador de producción Windows

Configura `ICONTAB_LICENSE_PUBLIC_KEY` como secreto del workflow **Build Windows** o como variable de entorno al compilar en Windows. Para la modalidad inicial offline, no configures `ICONTAB_LICENSE_SERVER_URL`:

```powershell
$env:ICONTAB_LICENSE_PUBLIC_KEY = "<clave-publica-base64>"
pnpm tauri:build
```

Si luego despliegas un servidor, configura además `ICONTAB_LICENSE_SERVER_URL` con su URL HTTPS y vuelve a compilar. Las licencias locales firmadas siguen verificándose sin conexión.
