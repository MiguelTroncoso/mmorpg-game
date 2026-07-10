# Cliente Godot (Fase 0)

Proyecto Godot 4.4+, renderer **Mobile**.

## Correr contra el servidor local

1. Levantar el servidor: `docker compose -f ../infra/docker-compose.yml up`
   (o `npm run dev` dentro de `/server`).
2. Abrir este proyecto en Godot y ejecutar. La escena `main.tscn` conecta a
   `127.0.0.1:2567` y muestra el estado (claves i18n, ES/EN/PT-BR).

En un Android físico, editar `server_host` en el nodo raíz de `main.tscn`
(export var) apuntando a la IP LAN de la máquina que corre el servidor.

## Qué hay aquí

- `scripts/msgpack.gd` — subset propio de MessagePack (ver ADR 001 y
  `shared/protocol/PROTOCOL.md`). Sin dependencias externas.
- `scripts/net_client.gd` — matchmaking HTTP + WebSocket crudo + frames
  ROOM_DATA. Solo transporte, cero lógica de juego.
- `scripts/main.gd` + `scenes/main.tscn` — muestra connected/error y responde
  al ping del servidor.

El wire format que habla este cliente está verificado byte a byte contra el
servidor real por `server/tests/connection.test.ts`.
