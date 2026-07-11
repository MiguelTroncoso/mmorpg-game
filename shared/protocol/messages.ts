/**
 * Definiciones de mensajes compartidas entre servidor (TS) y cliente (GDScript).
 *
 * El cliente GDScript no puede importar este archivo: PROTOCOL.md documenta el
 * wire format y este archivo es la fuente de verdad de nombres y formas.
 * Cambiar algo aquí => actualizar PROTOCOL.md y el cliente en el mismo commit.
 */

/** Versión del protocolo de aplicación. Sube al romper compatibilidad. */
export const PROTOCOL_VERSION = 1;

/** Tipos de mensaje (van como fixstr en el frame ROOM_DATA de Colyseus). */
export const MSG = {
  /** servidor → cliente, al entrar a la room */
  Ping: "ping",
  /** cliente → servidor, respuesta al ping */
  Pong: "pong",
  /** servidor → cliente, al entrar: id propio + jugadores presentes */
  Welcome: "welcome",
  /** servidor → todos: un jugador entró */
  Enter: "enter",
  /** servidor → todos: un jugador salió */
  Exit: "exit",
  /** cliente → servidor: INTENCIÓN de moverse a un punto (el servidor decide) */
  Move: "move",
  /** servidor → todos: snapshot de posiciones autoritativas */
  State: "state",
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

/** servidor → cliente */
export interface PingPayload {
  /** PROTOCOL_VERSION del servidor; el cliente debe rechazar si no coincide */
  v: number;
  /** epoch ms del servidor al enviar */
  t: number;
}

/** cliente → servidor: devuelve `t` intacto para medir RTT */
export interface PongPayload {
  t: number;
}

/** [sessionId, x, z] — forma compacta usada en welcome/enter/state */
export type PlayerTuple = [string, number, number];

/** servidor → cliente al entrar */
export interface WelcomePayload {
  v: number;
  /** sessionId propio del cliente */
  id: string;
  /** todos los jugadores presentes, incluido el propio */
  players: PlayerTuple[];
  /** Hz de snapshots, para que el cliente dimensione su interpolación */
  snapshotHz: number;
}

/** servidor → todos */
export interface EnterPayload {
  p: PlayerTuple;
}

/** servidor → todos */
export interface ExitPayload {
  id: string;
}

/** cliente → servidor: intención de destino. El servidor valida y mueve. */
export interface MovePayload {
  x: number;
  z: number;
}

/** servidor → todos, a snapshotHz */
export interface StatePayload {
  p: PlayerTuple[];
}
