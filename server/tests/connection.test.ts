import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { WebSocket } from "ws";
import type { Server } from "colyseus";
import { createGameServer } from "../src/app.js";
import { loadGameConfig, type GameConfig } from "../src/config/load.js";
import { setGameConfig } from "../src/config/runtime.js";
import { MSG, PROTOCOL_VERSION, type PlayerTuple } from "../../shared/protocol/messages.js";

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
let config: GameConfig;

before(async () => {
  config = loadGameConfig(); // mismo fail-fast que producción
  setGameConfig(config);
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

void test("matchmake + join crudo + ping/pong + movimiento autoritativo", async () => {
  // 1. Matchmaking HTTP — respuesta plana (verificado en PROTOCOL.md §1)
  const res = await fetch(`${HTTP}/matchmake/joinOrCreate/game`, {
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
  assert.equal(seat.name, "game");
  assert.ok(seat.sessionId.length > 0);

  // 2. WebSocket crudo con la reserva
  const ws = new WebSocket(
    `ws://127.0.0.1:${PORT}/${seat.processId}/${seat.roomId}?sessionId=${seat.sessionId}`,
  );
  // Cola con un único punto de entrada: el handler de "message" o resuelve al
  // que espera o encola — nunca ambos (dos listeners duplicarían frames).
  const frames: Buffer[] = [];
  let waiter: { resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null;
  ws.on("message", (data) => {
    const frame = Buffer.from(data as Buffer);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(frame);
    } else {
      frames.push(frame);
    }
  });
  ws.on("close", (code) => {
    waiter?.reject(new Error(`ws cerrado: ${code}`));
    waiter = null;
  });
  const nextFrame = (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const existing = frames.shift();
      if (existing) return resolve(existing);
      waiter = { resolve, reject };
    });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  // 3. Handshake: servidor manda JOIN_ROOM, cliente confirma con [10]
  const joinFrame = await nextFrame();
  assert.equal(joinFrame[0], JOIN_ROOM, `primer frame debe ser JOIN_ROOM, fue ${joinFrame[0]}`);
  ws.send(Buffer.from([JOIN_ROOM]));

  // 4. Welcome: [13][fixstr "welcome"][msgpack {v, id, players, snapshotHz}]
  const welcome = parseRoomData(await nextFrame());
  assert.equal(welcome.type, MSG.Welcome);
  const wp = welcome.payload as {
    v: number;
    id: string;
    players: PlayerTuple[];
    snapshotHz: number;
  };
  assert.equal(wp.v, PROTOCOL_VERSION);
  assert.equal(wp.id, seat.sessionId);
  assert.equal(wp.snapshotHz, config.world.net.snapshotHz);
  const self = wp.players.find(([id]) => id === seat.sessionId);
  assert.ok(self, "welcome.players debe incluir al propio jugador");
  const spawn = { x: self[1], z: self[2] };

  // 5. Ping del servidor + pong con el mismo encoding que usará GDScript
  const ping = parseRoomData(await nextFrame());
  assert.equal(ping.type, MSG.Ping);
  const pp = ping.payload as { v: number; t: number };
  assert.equal(pp.v, PROTOCOL_VERSION);
  assert.ok(pp.t > 0, "ping.t debe ser epoch ms");
  ws.send(encodeRoomData(MSG.Pong, { t: pp.t }));

  // 6. Intención de movimiento → snapshots autoritativos
  const target = { x: spawn.x + 3, z: spawn.z + 4 }; // a 5 unidades del spawn
  const moveSentAt = Date.now();
  ws.send(encodeRoomData(MSG.Move, target));

  const speed = config.world.movement.speedUnitsPerSecond;
  let last = spawn;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const frame = parseRoomData(await nextFrame());
    if (frame.type !== MSG.State) continue;
    const tuple = (frame.payload as { p: PlayerTuple[] }).p.find(([id]) => id === seat.sessionId);
    assert.ok(tuple, "el snapshot debe incluir al jugador");
    last = { x: tuple[1], z: tuple[2] };
    // El servidor jamás debe haber movido más lejos de lo que permite la
    // velocidad de config en el tiempo transcurrido (margen 1.5x por jitter).
    const traveled = Math.hypot(last.x - spawn.x, last.z - spawn.z);
    const elapsed = (Date.now() - moveSentAt) / 1000;
    assert.ok(
      traveled <= speed * elapsed * 1.5 + 0.001,
      `teleport: viajó ${traveled.toFixed(2)}u en ${elapsed.toFixed(2)}s (max ${speed}u/s)`,
    );
    if (Math.hypot(last.x - target.x, last.z - target.z) < 0.01) break;
  }
  assert.ok(
    Math.hypot(last.x - target.x, last.z - target.z) < 0.01,
    `el jugador debía llegar al destino; quedó en (${last.x.toFixed(2)}, ${last.z.toFixed(2)})`,
  );

  assert.equal(ws.readyState, WebSocket.OPEN, "la conexión debe seguir abierta");
  ws.close();
});

/** Parsea [13][fixstr tipo][payload msgpack] → {type, payload}. */
function parseRoomData(frame: Buffer): { type: string; payload: unknown } {
  assert.equal(frame[0], ROOM_DATA, `se esperaba ROOM_DATA, fue ${frame[0]}`);
  assert.equal(frame[1]! & 0xe0, 0xa0, "el tipo debe venir como fixstr de MessagePack");
  const typeLen = frame[1]! & 0x1f;
  const type = frame.subarray(2, 2 + typeLen).toString("utf-8");
  const [payload] = decodeMsgpackValue(frame, 2 + typeLen);
  return { type, payload };
}

/** Decoder MessagePack recursivo — el espejo de client/scripts/msgpack.gd. */
function decodeMsgpackValue(buf: Buffer, i: number): [unknown, number] {
  const b = buf[i]!;
  if (b <= 0x7f) return [b, i + 1]; // positive fixint
  if (b >= 0xe0) return [b - 0x100, i + 1]; // negative fixint
  if ((b & 0xe0) === 0xa0) return decodeStr(buf, i + 1, b & 0x1f); // fixstr
  if ((b & 0xf0) === 0x80) return decodeMap(buf, i + 1, b & 0x0f); // fixmap
  if ((b & 0xf0) === 0x90) return decodeArr(buf, i + 1, b & 0x0f); // fixarray
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
    case 0xd9:
      return decodeStr(buf, i + 2, buf.readUInt8(i + 1));
    case 0xda:
      return decodeStr(buf, i + 3, buf.readUInt16BE(i + 1));
    case 0xdc:
      return decodeArr(buf, i + 3, buf.readUInt16BE(i + 1));
    case 0xde:
      return decodeMap(buf, i + 3, buf.readUInt16BE(i + 1)); // msgpackr emite map16 por defecto
    default:
      throw new Error(`byte MessagePack no soportado por el test: 0x${b.toString(16)}`);
  }
}

function decodeStr(buf: Buffer, i: number, len: number): [string, number] {
  return [buf.subarray(i, i + len).toString("utf-8"), i + len];
}

function decodeArr(buf: Buffer, i: number, count: number): [unknown[], number] {
  const arr: unknown[] = [];
  for (let n = 0; n < count; n++) {
    const [v, next] = decodeMsgpackValue(buf, i);
    arr.push(v);
    i = next;
  }
  return [arr, i];
}

function decodeMap(buf: Buffer, i: number, count: number): [Record<string, unknown>, number] {
  const out: Record<string, unknown> = {};
  for (let n = 0; n < count; n++) {
    const [key, afterKey] = decodeMsgpackValue(buf, i);
    const [value, next] = decodeMsgpackValue(buf, afterKey);
    out[String(key)] = value;
    i = next;
  }
  return [out, i];
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
