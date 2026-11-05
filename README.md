# abx-tabs

Reproductor local de tablaturas de Guitar Pro, para apoyar el aprendizaje de guitarra y otros
instrumentos. Sin fines de lucro.

**No almacena tablaturas.** Los archivos se leen en tu propio equipo y nunca se envían a ningún
servidor.

Está pensado para pantallas de escritorio y aprovecha el ancho dividiendo la vista en hasta tres
instrumentos a la vez. No es responsive, a propósito.

---

## Qué necesitas

Una de estas dos opciones:

| | Requisito |
| --- | --- |
| **Con Docker** (recomendado) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) **abierto y corriendo** — el ícono de ballena en la bandeja del sistema |
| **Sin Docker** | [Node.js 24](https://nodejs.org) o superior |

Y un navegador **Chrome o Edge**. Funciona en Firefox, pero sin recordar el último archivo
abierto (ver [Abrir una tablatura](#abrir-una-tablatura)).

No hace falta instalar nada más: la fuente musical y el banco de sonidos vienen con las
dependencias y se copian solos.

## Cómo ejecutarlo

Todos los comandos se ejecutan en la carpeta del proyecto.

### Con Docker

```bash
docker compose up -d dev
```

Abre <http://localhost:5173>. Los cambios en `src/` se recargan en caliente.

```bash
docker compose logs -f dev    # ver la salida de Vite
docker compose down           # apagar
```

Para probar el bundle de producción servido por nginx:

```bash
docker compose --profile prod up -d --build prod   # http://localhost:8080
```

### Sin Docker

```bash
npm install
npm run dev
```

## Abrir una tablatura

Formatos admitidos: `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp7`.

Hay tres maneras:

- **Arrastrar** el archivo a cualquier punto de la ventana.
- **Botón "Abrir archivo"**, que abre el explorador del sistema.
- **Desplegable "Carpeta TABS"**: deja tus tablaturas en la carpeta `TABS/` del proyecto y
  aparecen listadas. Solo en modo desarrollo (ver [Arquitectura](#arquitectura)).

El último archivo abierto se recuerda y se intenta cargar al arrancar:

- Si venía de `TABS/`, se abre **solo**, sin pedir nada.
- Si lo abriste desde el explorador o arrastrándolo, aparece un botón `↻ nombre` para reabrirlo.
  Hace falta ese clic porque el navegador no permite recuperar el permiso de lectura sobre un
  archivo del disco sin un gesto del usuario.

Lo que se guarda es una *referencia* al archivo, nunca su contenido.

## Qué hace

- Play, pause, stop, control de posición y de velocidad
- Loop sobre un segmento de compases: `Ctrl` + clic en un compás lo marca y otro `Ctrl` + clic
  extiende el tramo; también se puede arrastrar o escribir los compases a mano
- Split screen vertical de hasta 3 instrumentos, cada uno con su pista y su scroll
- Cursor de reproducción: compás resaltado, línea sobre el golpe y notas en curso marcadas
- Rótulo con el nombre de las notas que suenan, encima del compás
- Panel con todas las cuerdas y la nota que suena en cada una
- Metrónomo con volumen regulable y compás de entrada con número de clicks configurable; ambos
  ajustes se recuerdan entre sesiones
- Visualización de la afinación del instrumento
- **Transposición de tono**: afina el instrumento en semitonos. Los trastes de la tablatura no
  cambian; cambia la altura a la que suena.
- **Ajuste de notas**: mueve los trastes mostrados para tocar la misma nota desde otra afinación

## Teclado

| Tecla | Acción |
| --- | --- |
| `Espacio` | play / pause |
| `←` `→` | nota anterior / siguiente |
| `Ctrl` + `←` `→` | compás anterior / siguiente |
| `Ctrl` + `←←` `→→` | sección anterior / siguiente (doble pulsación rápida) |
| `↑` `↓` | desplazar el panel activo |
| `Ctrl` + clic | marcar compases del loop |
| `Esc` | quitar el loop |

El panel activo es el último en el que hiciste clic; se marca con una línea en su cabecera.

## Arquitectura

React 19 + TypeScript + Vite 8, con [alphaTab](https://alphatab.net) encargándose de parsear los
archivos de Guitar Pro, renderizar la tablatura y sintetizar el audio.

- `src/player/TabPlayerProvider.tsx` — estado central y comandos del reproductor. La posición de
  reproducción no vive en estado de React: se emite unas 20 veces por segundo, así que pasa por
  `PositionStore` y los componentes se suscriben con `useSyncExternalStore`.
- `src/components/TrackPane.tsx` — un panel de instrumento. Cada panel es una instancia
  independiente de alphaTab que parsea su propia copia del archivo, de modo que puedan mostrar
  pistas distintas sin compartir un modelo mutable.
- `src/player/beatMarker.ts` — el rótulo de notas sobre el compás. Resuelve el golpe desde el
  tick con `tickCache`, no desde el evento de reproducción, porque ese solo lo emite el panel que
  suena; así cada panel rotula su propio instrumento.
- `src/player/recentFile.ts` — memoria del último archivo.
- `src/player/useKeyboardControls.ts`, `src/player/useFileDrop.ts` — teclado y arrastre.
- `src/lib/` — cálculos puros: afinación, notas, compases, secciones.
- `vite/tabsLibraryPlugin.ts` — expone la carpeta `TABS/` como desplegable. Es un plugin **solo
  de desarrollo**: en producción no existe, para que las tablaturas no acaben dentro de una
  imagen de Docker ni servidas por nginx.

### Un solo panel produce audio

El primer panel es el maestro: es el único con sintetizador audible y el que manda el transporte.
Los paneles seguidores llevan el volumen a cero y nunca reproducen; su cursor se mueve
posicionándolos en el tick que reporta el maestro. Así hay un solo reloj y un solo sintetizador
activo por más paneles que se abran.

### Metrónomo y compás de entrada

El click de alphaTab suena bastante más bajo que los instrumentos. Su volumen es una ganancia sin
tope superior, así que el valor de fábrica es `2` y el control llega hasta `4`.

El compás de entrada no usa el de alphaTab, cuya duración está fijada a un compás
(`clickCount = timeSignatureNumerator`). Para poder elegir cuántos clicks suenan se sintetiza
aparte en `src/player/countIn.ts` con Web Audio, y el de alphaTab se deja en silencio para que no
se dupliquen.

### Los dos controles de tono

Se componen en tres capas que alphaTab suma por separado, y el resultado es:

```
traste mostrado = traste del archivo + ajuste de notas
altura sonora   = altura del archivo + ajuste de notas + transposición de tono
```

La percusión queda excluida de ambos: ahí el número midi identifica el tambor, no una altura, y
transponerla cambiaría el bombo por la caja. `scripts/verify-transposition.mjs` comprueba todo
esto contra el sintetizador real.

### Assets de alphaTab

La fuente musical Bravura y el banco de sonidos se copian de `node_modules` a `public/` mediante
`scripts/copy-alphatab-assets.mjs`, que corre desde `predev` y `prebuild`. El plugin de Vite de
alphaTab también sabe copiarlos, pero lo hace en un hook que corre después de que el dev server
indexó `public/`: en el primer arranque los archivos quedaban en disco pero se servían como 404.
De ahí que la copia sea un paso previo explícito.

## Verificación

```bash
npm run typecheck                        # TypeScript
node scripts/verify-transposition.mjs    # semántica de los controles de tono
```

Las pruebas de extremo a extremo usan Playwright, que no es una dependencia del proyecto. Se
instala aparte y se le indica dónde está:

```bash
cd <una carpeta cualquiera> && npm i playwright && npx playwright install chromium
PW_ROOT=<esa carpeta> node tests/e2e/run-all.mjs
```

Necesitan el dev server corriendo. Los fixtures que hagan falta se generan solos.

## Licencias de terceros

alphaTab se distribuye bajo MPL-2.0. La fuente Bravura es OFL y el banco de sonidos Sonivox trae
su propia licencia; ambos se copian a `public/` junto con sus archivos de licencia.
