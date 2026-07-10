# Protocolo Godot ↔ servidor (Fase 0)

Decisión: ADR `docs/decisions/001-transport.md`. El cliente NO usa SDK de Colyseus;
habla el handshake de matchmaking + frames `ROOM_DATA` con payload MessagePack.

Verificado contra Colyseus 0.17.10 leyendo su código y con el test de integración
`server/tests/connection.test.ts`, que actúa como cliente crudo byte a byte.

## 1. Matchmaking (HTTP)

```
POST http://HOST:2567/matchmake/joinOrCreate/lobby
Content-Type: application/json
Body: {}
```

Respuesta 200 (verificada contra Colyseus 0.17.10 — es plana, sin objeto `room`):

```json
{
  "name": "lobby",
  "sessionId": "...",
  "roomId": "...",
  "processId": "..."
}
```

## 2. Conexión WebSocket

```
ws://HOST:2567/{processId}/{roomId}?sessionId={sessionId}
```

Mensajes binarios. El primer byte de cada frame es el código de protocolo Colyseus:

| Código | Nombre | Dirección |
|---|---|---|
| 10 | JOIN_ROOM | servidor → cliente, luego cliente → servidor (confirmación) |
| 11 | ERROR | servidor → cliente |
| 12 | LEAVE_ROOM | ambas |
| 13 | ROOM_DATA | ambas — **aquí viven nuestros mensajes** |

### Handshake de join

1. Al abrir el socket, el servidor envía un frame que empieza con byte `10`
   (JOIN_ROOM). El resto (reconnection token, serializer) se ignora en Fase 0.
2. El cliente responde con un frame de **un solo byte**: `[10]`.
3. A partir de ahí la conexión está unida a la room (`onJoin` corre en el servidor).

### Frames ROOM_DATA (código 13)

```
[13][tipo][payload]
```

- `tipo`: string codificado como **fixstr de MessagePack** (`0xA0 | len`, luego
  UTF-8). Todos nuestros tipos tienen < 32 bytes.
- `payload`: un valor MessagePack estándar (el servidor usa msgpackr).

El mismo formato aplica en ambas direcciones: el servidor lo produce con
`client.send(tipo, payload)` y lo consume con `room.onMessage(tipo, ...)`.

Hallazgos verificados por el test (importan al decoder/encoder del cliente):

1. **msgpackr codifica maps como `map16` (0xDE)**, no fixmap, incluso con pocas
   claves. El decoder del cliente debe aceptar ambos.
2. **Enteros fuera de rango int32 se envían como float64 (0xCB).** Si el cliente
   manda uint64 (0xCF), el servidor lo decodifica como BigInt, la validación zod
   lo rechaza y **Colyseus cierra la conexión** (close code 4002 WITH_ERROR).
   float64 representa enteros exactos hasta 2^53 — sobra para epoch ms.
3. Un mensaje que no pasa la validación zod del servidor desconecta al cliente.
   Es intencional: un cliente que manda basura no se queda conectado.

## 3. Mensajes de aplicación (v1)

Fuente de verdad de formas: `shared/protocol/messages.ts`.

| Tipo | Dirección | Payload |
|---|---|---|
| `ping` | servidor → cliente (al entrar) | `{ v: uint, t: uint64 epoch ms }` |
| `pong` | cliente → servidor | `{ t }` (el mismo `t`, intacto) |

Regla: si `ping.v` ≠ versión del cliente, el cliente muestra error de versión y
desconecta. Nunca "intenta igual".
