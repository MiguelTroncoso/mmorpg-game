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
