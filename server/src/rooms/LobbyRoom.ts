import { Room, type Client } from "colyseus";
import { MSG, PROTOCOL_VERSION, type PingPayload } from "../../../shared/protocol/messages.js";
import { pongSchema } from "../net/messages.js";

/**
 * Room mínima de Fase 0: acepta la conexión y hace ping/pong para verificar el
 * transporte extremo a extremo. Sin estado, sin gameplay.
 */
export class LobbyRoom extends Room {
  override onCreate(): void {
    this.onMessage(MSG.Pong, pongSchema, (client, message) => {
      const rttMs = Date.now() - message.t;
      console.log(`[lobby] pong de ${client.sessionId} — rtt ${rttMs}ms`);
    });
  }

  override onJoin(client: Client): void {
    console.log(`[lobby] join ${client.sessionId}`);
    const ping: PingPayload = { v: PROTOCOL_VERSION, t: Date.now() };
    client.send(MSG.Ping, ping);
  }

  override onLeave(client: Client): void {
    console.log(`[lobby] leave ${client.sessionId}`);
  }
}
