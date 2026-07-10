# 001 — Transporte Godot ↔ Colyseus

Estado: **Propuesta — pendiente de confirmación**
Fecha: 2026-07-10 (extendida el mismo día con criterios ponderados)
Fase: 0

## Contexto

CLAUDE.md exige decidir, antes de escribir gameplay, cómo se comunica el cliente Godot 4
con el servidor Colyseus: usando un SDK de cliente para Godot, o `WebSocketPeer` nativo +
un formato binario propio (MessagePack). Esta decisión condiciona el protocolo de red de
todo el proyecto, así que se documenta como ADR.

Criterios de evaluación, en orden de peso (definidos por el propietario del proyecto):

1. Riesgo de quedar bloqueado por una dependencia sin mantener
2. Esfuerzo de implementar AOI (area of interest) e interpolación
3. Rendimiento en Android de gama media
4. Facilidad de depurar el protocolo

## Opciones evaluadas

### A) `colyseus/native-sdk` — GDExtension oficial (Godot 4.x)

Repo: https://github.com/colyseus/native-sdk

- SDK **oficial** del equipo de Colyseus, escrito en Zig, compilado como GDExtension nativa.
- Plataformas declaradas: Windows, macOS, Linux, iOS, **Android**, Web.
- Última release del SDK de Godot: `v0.17.11` (jun 2026). Cadencia de releases alta
  (0.17.5 → 0.17.11 en ~3 meses). Targetea **Colyseus 0.17.x** en el servidor.
- Historial Android reciente (de las release notes):
  - v0.17.9: el `.so` de Android pasó a linkear bionic libc vía NDK; minSdk subido a 24
    (coincide con nuestro target).
  - v0.17.10: fix de **crash (SIGTRAP/SIGSEGV) en exports Android release** al parsear
    schemas desde GDScript.
  - v0.17.11: fix de **fallo de TLS (`wss://`) en builds release de Android** por carga
    del bundle de certificados.
- Issues abiertos: 4, de los cuales uno es un **crash del plugin en Windows (#20, mar
  2026, sin cerrar)** — relevante porque el desarrollo diario ocurre en desktop.
- README: **"under active development", API inestable, breaking changes posibles en
  cualquier momento.** Licencia MIT.
- Lectura honesta: mantenimiento activo y respuesta rápida a bugs, pero los bugs que
  arreglaron hace semanas (crash en Android release, TLS roto) son exactamente de la
  clase que bloquea un lanzamiento. El SDK es joven en la plataforma que más nos importa.

### B) `gsioteam/godot-colyseus` — SDK comunitario en GDScript puro

Repo: https://github.com/gsioteam/godot-colyseus

- Escrito 100% en GDScript, sin binarios nativos → portable a Android sin fricción.
- ~25 commits totales, sin releases versionadas, sin target de Godot documentado, sin
  actividad reciente detectable. No documenta qué versión del protocolo de Colyseus
  soporta — el protocolo de schema cambió entre 0.15 → 0.16 → 0.17, así que es probable
  que esté desfasado respecto a un servidor 0.17.
- Replica el parsing del schema binario de Colyseus a mano en GDScript: el código con
  mayor riesgo de desync silencioso, en el runtime más lento, mantenido por nadie.
- Se descarta sin necesidad de más análisis. Se documenta para que no se reevalúe.

### C) `WebSocketPeer` nativo de Godot + MessagePack + protocolo propio

- `WebSocketPeer` es parte del engine desde Godot 4.0, estable, sin dependencias
  externas, idéntico en todas las plataformas de export incluyendo Android.
- MessagePack: implementación pura en GDScript de un solo archivo (Asset Library,
  https://godotengine.org/asset-library/asset/4055), copiable a `/client/addons` y
  auditable en minutos. Justificación según convención #5 de CLAUDE.md: la alternativa
  es escribir un serializador binario propio (más superficie de bugs) o usar JSON
  (más bytes y más CPU de parseo en móvil).
- El servidor **sigue siendo Colyseus** (rooms, matchmaking, ciclo de vida, presencia).
  Lo que cambia: el cliente no usa `@colyseus/schema` para el state sync; los mensajes
  van como payloads MessagePack propios definidos en `/shared/protocol`, vía
  `room.onMessage` / `client.send` de Colyseus en el servidor.
- Coste real que hay que nombrar: Colyseus no acepta un WebSocket "crudo" sin más —
  tiene un flujo de matchmaking (HTTP POST de reserva de asiento → conexión WS con la
  reserva). Ese handshake hay que implementarlo en el cliente (~50-100 LOC, HTTP +
  query params, documentado y estable entre versiones). Es trabajo de una vez.

## Análisis por criterio (en orden de peso)

### 1. Riesgo de dependencia sin mantener

| | Riesgo |
|---|---|
| A | **Medio.** Proyecto oficial y activo, pero beta declarada + binarios por plataforma/versión de Godot. Un breaking change o un bug de plataforma nos deja esperando upstream, o manteniendo un fork en Zig (toolchain que no dominamos). El crash de Windows #20 lleva ~4 meses abierto. |
| B | **Alto.** Sin señales de vida. Descartado. |
| C | **Bajo.** `WebSocketPeer` es API del engine. MessagePack es 1 archivo GDScript que podemos mantener nosotros. El único acople a Colyseus es el handshake de matchmaking, que es pequeño y estable. |

**Gana C.** Este es el criterio de mayor peso y la diferencia es estructural, no de grado:
en C no existe ningún tercero que pueda bloquearnos; en A sí, y en la fase donde más
dolería (integración Android, Fases 1-3).

### 2. Esfuerzo de AOI e interpolación

Primero lo que es igual en todas las opciones: **la interpolación es 100% trabajo del
cliente en cualquier caso.** Ningún SDK la regala; hay que escribir el buffer de
snapshots y el lerp en GDScript igual. Este sub-criterio no discrimina.

AOI sí discrimina:

| | Esfuerzo AOI |
|---|---|
| A | El state sync de Colyseus replica el estado de la room a todos por defecto. Para AOI se usa `StateView` (filtrado por cliente, Colyseus 0.16+) en el servidor, y el SDK aplica los deltas en el cliente. Menos código propio, pero el filtrado queda acoplado al modelo de schema de Colyseus, y depurar *por qué* una entidad no llegó implica entender el pipeline interno del SDK. |
| C | AOI es simplemente *a quién le mando qué mensaje*: `entity_enter`, `entity_update`, `entity_exit` por cliente según distancia. Es más código inicial (protocolo + aplicación de mensajes al estado local, estimado 300-500 LOC entre servidor y cliente), pero el AOI queda **explícito y trivial de razonar**, que es lo que CLAUDE.md pide para Fase 1. |

**Empate técnico con matiz:** A ahorra código, C ahorra opacidad. Dado que AOI es
requisito de Fase 1 y el mecanismo de C es el diseño natural de un AOI (mensajes
enter/exit), el coste extra de C se paga una vez y queda alineado con la arquitectura
"cliente recibe intención aplicada, no estado mágico".

### 3. Rendimiento en Android de gama media

| | Rendimiento de decodificación |
|---|---|
| A | **El mejor en teoría.** Decodificación de deltas en código nativo (Zig). |
| C | Decode MessagePack en GDScript interpretado. Con AOI activo, el payload por tick es pequeño (decenas de entidades × ~20-30 bytes). A 10 Hz de tick de red, la carga estimada es de miles de valores/segundo, muy por debajo de lo que GDScript maneja — pero **esto es una estimación, no una medición** (ver sección de incertidumbre). Si midiera mal, la salida de emergencia es portar el decoder a C# o GDExtension propia sin cambiar el protocolo. |

**Gana A en bruto.** Pero el margen probablemente no importa a nuestra escala
(100-500 concurrentes en el servidor; el cliente solo ve el subconjunto AOI), y A
acaba de arreglar crashes de release en Android, lo que descuenta su ventaja teórica
con riesgo práctico.

### 4. Facilidad de depurar el protocolo

| | Depurabilidad |
|---|---|
| A | Protocolo binario interno de `@colyseus/schema`: opaco sin conocer el formato; los bugs del lado cliente viven dentro de una GDExtension compilada (depurar = toolchain Zig + rebuild). |
| C | Poseemos cada byte. Cada mensaje tiene tipo y versión definidos en `/shared/protocol`; se puede loggear, reproducir y diffear en ambos extremos. MessagePack tiene tooling estándar (msgpack-tools, inspección en cualquier lenguaje). Un bug de desync se investiga con un log de mensajes, no con un debugger nativo. |

**Gana C con claridad.** Para un juego donde el desync/duplicación de items es el riesgo
señalado como mortal (CLAUDE.md §9), poder auditar el wire format es valor directo.

## Lo que NO está verificado (y cómo verificarlo)

Ser explícito con esto, como pide el prompt:

1. **No probé el native-sdk en un dispositivo Android real.** Las notas de release
   sugieren que v0.17.11 funciona en release builds, pero es información de segunda
   mano. Verificación: proyecto Godot mínimo + native-sdk + export release a un
   Android de gama media, conectando por `wss://`. ~medio día.
2. **No medí el throughput de decode de MessagePack en GDScript en gama media.** Mi
   estimación de "sobra" es razonamiento, no dato. Verificación: benchmark sintético
   en un dispositivo real — decodificar N updates de entidad por frame y medir ms/frame
   (objetivo: presupuesto de red < 2 ms/frame a 30 entidades × 10 Hz). ~medio día,
   y puede hacerse dentro de la Fase 0 al montar el ping.
3. **No sé si el crash de Windows (#20) afecta al flujo de desarrollo diario** con la
   versión actual del SDK — solo que sigue abierto.
4. **La versión del protocolo de matchmaking de Colyseus** que habría que hablar en la
   opción C está documentada, pero no la he implementado nunca contra un servidor 0.17.
   Riesgo bajo (es HTTP + query params), se verifica en el propio scaffold de Fase 0.

**Ninguna de estas incertidumbres invierte la recomendación**, porque el criterio #1
(riesgo de dependencia) domina y no depende de ellas. La #2 es la única que podría
forzar un cambio de plan (decoder nativo propio), y tiene salida sin rediseño.

## Recomendación

**Opción C: `WebSocketPeer` nativo + MessagePack + protocolo propio en `/shared/protocol`,
con Colyseus intacto en el servidor.**

Resumen por criterio ponderado: C gana el #1 (el de mayor peso, por diferencia
estructural) y el #4; empata con matiz favorable el #2; cede el #3 en teoría con
margen sobrado en la práctica a nuestra escala — pendiente de la medición descrita
arriba, que se hace en Fase 0 sin coste extra.

### Consecuencias

- Hay que escribir y mantener: el handshake de matchmaking en el cliente, el
  (de)serializador de mensajes, y la aplicación de mensajes al estado local
  (enter/update/exit). Coste único estimado: 2-4 días dentro de Fase 0/1.
- No hay reconciliación de estado automática: cada mensaje nuevo del protocolo se
  define a mano en `/shared/protocol`, con campo de versión desde el día 1 para
  poder evolucionar sin romper clientes viejos en producción.
- El benchmark de decode (incertidumbre #2) se ejecuta durante la Fase 0 en el mismo
  dispositivo del "export APK de prueba". Si falla el presupuesto, el plan B es un
  decoder nativo propio manteniendo el mismo wire format — el protocolo no cambia.
- Punto de reevaluación explícito: si al cierre de Fase 1 el native-sdk saca una 1.0
  estable y el coste de mantener el protocolo propio resultó mayor al estimado, se
  puede migrar — el servidor ya es Colyseus y no se tocó.

## Estado

Pendiente de confirmación del propietario del proyecto antes de proceder al scaffold del
monorepo (sesión 2 de la guía de arranque).

## Fuentes consultadas

- https://github.com/colyseus/native-sdk (README, releases hasta v0.17.11, issues abiertos)
- https://github.com/gsioteam/godot-colyseus
- https://docs.godotengine.org/en/stable/classes/class_websocketpeer.html
- https://godotengine.org/asset-library/asset/4055 (MessagePack para Godot 4, GDScript puro)
