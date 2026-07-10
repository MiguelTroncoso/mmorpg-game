# 001 — Transporte Godot ↔ Colyseus

Estado: **Propuesta — pendiente de confirmación**
Fecha: 2026-07-10
Fase: 0

## Contexto

CLAUDE.md exige decidir, antes de escribir gameplay, cómo se comunica el cliente Godot 4
con el servidor Colyseus: usando un SDK de cliente para Godot, o `WebSocketPeer` nativo +
un formato binario propio (MessagePack). Esta decisión condiciona el protocolo de red de
todo el proyecto, así que se documenta como ADR.

## Opciones evaluadas

### A) `colyseus/native-sdk` — GDExtension oficial (Godot 4.x)

Repo: https://github.com/colyseus/native-sdk

- SDK **oficial** del equipo de Colyseus, escrito en Zig, compilado como GDExtension nativa.
- Plataformas declaradas: Windows, macOS, Linux, iOS, **Android**, Web.
- Última release del SDK de Godot: `godot-sdk v0.17.11` (7 jun 2026). Actividad reciente
  (commits hasta el 21 jun 2026) — proyecto vivo, no abandonado.
- README lo marca explícitamente como **"under active development", API inestable, breaking
  changes en cualquier momento**. Es GDExtension binaria: hay que compilar o descargar
  binarios por plataforma, incluyendo Android, y mantenerlos sincronizados con cada versión
  de Godot/Colyseus.
- Implementa el protocolo binario propio de Colyseus (`@colyseus/schema`), con sync de state
  automático — evita reimplementar delta-encoding de schemas a mano.
- 4 issues abiertos, licencia MIT.

### B) `gsioteam/godot-colyseus` — SDK comunitario en GDScript puro

Repo: https://github.com/gsioteam/godot-colyseus

- Escrito 100% en GDScript, sin binarios nativos → fácil de auditar y de portar a Android
  sin pasos de compilación extra.
- Solo 25 commits totales, sin versión/Godot-target documentada en el README, sin señales
  de mantenimiento activo reciente. Riesgo de quedar huérfano si aparece un bug con Godot
  4.4+ o con una versión nueva del protocolo de Colyseus.
- Replica la API de `colyseus.js`, incluyendo el parsing del schema binario de Colyseus a
  mano en GDScript — esto es exactamente el código más propenso a bugs sutiles (fuera de
  sync silencioso) y el que menos se beneficia de estar en GDScript puro (rendimiento).

### C) `WebSocketPeer` nativo de Godot + MessagePack + protocolo propio

- `WebSocketPeer` es parte del engine desde Godot 4.0, estable, sin dependencias externas,
  funciona igual en todas las plataformas de export incluyendo Android.
- MessagePack: no hay soporte nativo en el engine, pero existe una implementación pura en
  GDScript (un solo archivo, sin binarios) disponible en la Asset Library. Aceptable copiarla
  al repo bajo `/client/addons` o reimplementar el subset que se necesita (unos ~150 LOC).
  Justifica la dependencia según convención #5 de CLAUDE.md: sin esto habría que escribir un
  serializador binario propio, que es más superficie de bugs que adoptar una lib de un
  archivo, auditable en minutos.
- Implica **renunciar al room/state-sync automático de Colyseus** en el cliente: el servidor
  sigue siendo Colyseus (rooms, matchmaking, reconexión), pero el cliente habla un protocolo
  de mensajes propio sobre el mismo socket en vez de usar `@colyseus/schema` binario. Hay que
  definir manualmente los mensajes en `/shared/protocol` y aplicarlos al state local del
  cliente. Esto es más trabajo inicial pero **cero dependencia de un SDK de terceros con API
  inestable**.
- Colyseus permite este patrón: un cliente "tonto" puede conectarse al WebSocket crudo de una
  room (`ws://host/matchmake/...`) sin usar el SDK, siempre que hable el protocolo esperado;
  la alternativa más simple en la práctica es no usar el protocolo de schema de Colyseus y
  mandar JSON/MessagePack propio sobre mensajes de tipo `"type"` que el servidor interpreta
  como Colyseus `onMessage`, dejando el `@colyseus/schema` solo para lo que el server ya
  necesita internamente (o ni eso, si se prefiere state propio).

## Comparación

| Criterio | A) native-sdk (GDExtension) | B) godot-colyseus (GDScript) | C) WebSocketPeer + MessagePack |
|---|---|---|---|
| Mantenimiento activo | Sí (oficial, commits recientes) | Dudoso (bajo volumen, sin releases claras) | N/A (es engine core + lib de 1 archivo) |
| Estabilidad de API | Explícitamente inestable (beta) | Desconocida, no documentada | Estable (API del engine) |
| Soporte Android confirmado | Declarado, pero binario GDExtension por compilar/actualizar por plataforma | GDScript puro, sin binarios — portable | Nativo del engine, cero fricción |
| Auto state-sync (schema binario) | Sí, de fábrica | Sí, reimplementado a mano en GDScript | No — hay que construir el protocolo propio |
| Riesgo de bloqueo por dependencia externa | Medio-alto (beta + binarios por versión de Godot) | Alto (posible abandono) | Bajo (una lib de 1 archivo, reemplazable) |
| Alineado con "servidor autoritativo, cliente envía intención" | Sí | Sí | Sí, e incluso más explícito al diseñar el protocolo a mano |
| Curva de trabajo inicial (Fase 0) | Baja (usar el SDK) | Baja (usar el SDK) | Media (definir protocolo + integrar MessagePack) |
| Coste a mediano plazo (Fase 1+) | Riesgo de breaking changes del SDK bloqueando features | Riesgo de tener que forkear/parchear un SDK sin dueño | Coste ya pagado en Fase 0, protocolo propio estable después |

## Recomendación

**Opción C: `WebSocketPeer` nativo + MessagePack + protocolo propio en `/shared/protocol`.**

Razones:

1. El SDK oficial (A) está en beta con advertencia explícita de breaking changes, y añade una
   dependencia binaria (GDExtension) por plataforma de export, incluyendo Android — justo la
   plataforma objetivo de este proyecto. Un breaking change del SDK a mitad de Fase 1-3
   bloquearía el desarrollo del juego, no solo del transporte.
2. El SDK comunitario (B) no muestra señales de mantenimiento activo suficiente para
   apostar años de desarrollo sobre él, y su mayor "ventaja" (parsing de schema binario)
   es precisamente el código con más riesgo si queda desactualizado respecto al servidor.
3. Colyseus en el servidor **no se descarta**: se sigue usando para rooms, matchmaking y
   ciclo de vida de conexión en `/server`. Lo que cambia es que el cliente no depende de un
   SDK de terceros para hablar con esas rooms — habla el protocolo binario que definamos
   nosotros en `/shared/protocol`, que es exactamente lo que pide la convención de
   CLAUDE.md de "servidor autoritativo / cliente envía intención".
4. MessagePack en GDScript puro (sin binarios) es una dependencia mínima, auditable, y
   reemplazable sin tocar el resto del cliente si algún día deja de convenir.
5. El coste de escribir el protocolo a mano se paga una vez en Fase 0 y da control total
   sobre el formato de mensajes — relevante para un juego con estado de items/inventario
   donde la corrupción o desync silenciosa es inaceptable (ver riesgo de duplicación de
   items en CLAUDE.md §9).

**Contras aceptados:** no hay reconciliación de state automática; el equipo (yo) debe
implementar y mantener el (de)serializador de mensajes y la sincronización de entidades a
mano. Se documentará el formato de protocolo en `/shared/protocol` y su versión de mensaje
para poder evolucionar sin romper clientes viejos en producción.

## Estado

Pendiente de confirmación del propietario del proyecto antes de proceder al scaffold del
monorepo (paso 2 del prompt de arranque, CLAUDE.md §8).

## Fuentes consultadas

- https://github.com/colyseus/native-sdk
- https://github.com/gsioteam/godot-colyseus
- https://docs.godotengine.org/en/stable/classes/class_websocketpeer.html
- https://godotengine.org/asset-library/asset/4055 (MessagePack para Godot 4, GDScript puro)
