import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { WebSocket } from "ws";
import type { Server } from "colyseus";
import { createGameServer } from "../src/app.js";
import { loadGameConfig } from "../src/config/load.js";
import { MSG, PROTOCOL_VERSION } from "../../shared/protocol/messages.js";

/**
 * Test de integración del wire format: actúa como el cliente GDScript, byte a
 * byte, sin SDK de Colyseus. Si esto pasa, lo documentado en
 * shared/protocol/PROTOCOL.md es cierto contra el servidor real.
 */

const PORT = 25670;
const HTTP = `http://127.0.0.1:${PORT}`;

const JOIN_ROOM = 10;
const ROOM_DATA = 13;

let gameServer: Server;

before(async () => {
  loadGameConfig(); // mismo fail-fast que producción
  gameServer = createGameServer();
  await gameServer.listen(PORT);
});

after(async () => {
  await gameServer.gracefullyShutdown(false);
});

void test("GET /health responde 200", async () => {
  const res = await fetch(`${HTTP}/health`);
  assert.equal(res.status, 200);
});

void test("matchmake + join crudo + ping/pong MessagePack", async () => {
  // 1. Matchmaking HTTP — respuesta plana (verificado en PROTOCOL.md §1)
  const res = await fetch(`${HTTP}/matchmake/joinOrCreate/lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 200);
  const seat = (await res.json()) as {
    name: string;
    sessionId: string;
    roomId: string;
    processId: string;
  };
  assert.equal(seat.name, "lobby");
  assert.ok(seat.sessionId.length > 0);

  // 2. WebSocket crudo con la reserva
  const ws = new WebSocket(
    `ws://127.0.0.1:${PORT}/${seat.processId}/${seat.roomId}?sessionId=${seat.sessionId}`,
  );
  const frames: Buffer[] = [];
  const nextFrame = (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const existing = frames.shift();
      if (existing) return resolve(existing);
      ws.once("message", (data) => resolve(Buffer.from(data as Buffer)));
      ws.once("error", reject);
      ws.once("close", (code) => reject(new Error(`ws cerrado: ${code}`)));
    });
  ws.on("message", (data) => frames.push(Buffer.from(data as Buffer)));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  // 3. Handshake: servidor manda JOIN_ROOM, cliente confirma con [10]
  const joinFrame = await nextFrame();
  assert.equal(joinFrame[0], JOIN_ROOM, `primer frame debe ser JOIN_ROOM, fue ${joinFrame[0]}`);
  ws.send(Buffer.from([JOIN_ROOM]));

  // 4. Ping del servidor: [13][fixstr "ping"][msgpack {v, t}]
  const pingFrame = await nextFrame();
  assert.equal(pingFrame[0], ROOM_DATA, `se esperaba ROOM_DATA, fue ${pingFrame[0]}`);
  const typeLen = pingFrame[1]! & 0x1f;
  assert.equal(pingFrame[1]! & 0xe0, 0xa0, "el tipo debe venir como fixstr de MessagePack");
  const msgType = pingFrame.subarray(2, 2 + typeLen).toString("utf-8");
  assert.equal(msgType, MSG.Ping);

  const payload = decodeMsgpackMap(pingFrame.subarray(2 + typeLen));
  assert.equal(payload.v, PROTOCOL_VERSION);
  assert.ok(typeof payload.t === "number" && payload.t > 0, "ping.t debe ser epoch ms");

  // 5. Pong del cliente con el mismo encoding que usará GDScript
  const pong = encodeRoomData(MSG.Pong, { t: payload.t });
  ws.send(pong);

  // Si el pong fuera rechazado (validación zod o encoding malo), Colyseus no
  // cierra el socket, así que verificamos que la conexión sigue viva tras un tick.
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(ws.readyState, WebSocket.OPEN, "la conexión debe seguir abierta tras el pong");
  ws.close();
});

/** Decodifica un map MessagePack plano {str: number|str|bool} — subset del cliente. */
function decodeMsgpackMap(buf: Buffer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;
  const first = buf[i]!;
  let size: number;
  if ((first & 0xf0) === 0x80) {
    size = first & 0x0f; // fixmap
    i += 1;
  } else if (first === 0xde) {
    size = buf.readUInt16BE(i + 1); // map16 — msgpackr lo usa por defecto
    i += 3;
  } else {
    throw new Error(`se esperaba fixmap o map16, byte 0x${first.toString(16)}`);
  }
  for (let n = 0; n < size; n++) {
    const kh = buf[i]!;
    assert.equal(kh & 0xe0, 0xa0, "clave debe ser fixstr");
    const klen = kh & 0x1f;
    const key = buf.subarray(i + 1, i + 1 + klen).toString("utf-8");
    i += 1 + klen;
    const [value, next] = decodeMsgpackValue(buf, i);
    out[key] = value;
    i = next;
  }
  return out;
}

function decodeMsgpackValue(buf: Buffer, i: number): [unknown, number] {
  const b = buf[i]!;
  if (b <= 0x7f) return [b, i + 1]; // positive fixint
  if (b >= 0xe0) return [b - 0x100, i + 1]; // negative fixint
  switch (b) {
    case 0xc0:
      return [null, i + 1];
    case 0xc2:
      return [false, i + 1];
    case 0xc3:
      return [true, i + 1];
    case 0xcc:
      return [buf.readUInt8(i + 1), i + 2];
    case 0xcd:
      return [buf.readUInt16BE(i + 1), i + 3];
    case 0xce:
      return [buf.readUInt32BE(i + 1), i + 5];
    case 0xcf:
      return [Number(buf.readBigUInt64BE(i + 1)), i + 9];
    case 0xd0:
      return [buf.readInt8(i + 1), i + 2];
    case 0xd1:
      return [buf.readInt16BE(i + 1), i + 3];
    case 0xd2:
      return [buf.readInt32BE(i + 1), i + 5];
    case 0xd3:
      return [Number(buf.readBigInt64BE(i + 1)), i + 9];
    case 0xca:
      return [buf.readFloatBE(i + 1), i + 5];
    case 0xcb:
      return [buf.readDoubleBE(i + 1), i + 9];
    default:
      throw new Error(`byte MessagePack no soportado por el test: 0x${b.toString(16)}`);
  }
}

/** Codifica [13][fixstr tipo][msgpack map] exactamente como lo hará el cliente GDScript. */
function encodeRoomData(type: string, payload: Record<string, number>): Buffer {
  const parts: number[] = [ROOM_DATA, 0xa0 | type.length, ...Buffer.from(type, "utf-8")];
  const keys = Object.keys(payload);
  parts.push(0x80 | keys.length);
  for (const key of keys) {
    parts.push(0xa0 | key.length, ...Buffer.from(key, "utf-8"));
    const value = payload[key]!;
    // Regla del protocolo: enteros fuera de int32 van como float64 (0xcb).
    // uint64 (0xcf) decodifica a BigInt en el servidor y la validación lo rechaza.
    const b = Buffer.alloc(9);
    b[0] = 0xcb;
    b.writeDoubleBE(value, 1);
    parts.push(...b);
  }
  return Buffer.from(parts);
}
