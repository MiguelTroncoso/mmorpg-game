import { Room, type Client } from "colyseus";
import {
  MSG,
  PROTOCOL_VERSION,
  type EnterPayload,
  type ExitPayload,
  type PingPayload,
  type PlayerTuple,
  type StatePayload,
  type WelcomePayload,
} from "../../../shared/protocol/messages.js";
import { moveSchema, pongSchema } from "../net/messages.js";
import { clampToBounds, stepToward, type Vec2 } from "../domain/movement.js";
import { getGameConfig } from "../config/runtime.js";

interface PlayerState {
  pos: Vec2;
  target: Vec2;
}

/**
 * Room de Fase 0: posiciones autoritativas en un plano.
 * El cliente envía INTENCIÓN (`move` con un destino); el servidor valida,
 * simula a tick fijo con la velocidad de config y publica snapshots.
 * Sin gameplay: ni HP, ni combate, ni items. Eso es Fase 1+.
 */
export class GameRoom extends Room {
  private players = new Map<string, PlayerState>();

  override onCreate(): void {
    const { movement, net } = getGameConfig().world;

    this.onMessage(MSG.Move, moveSchema, (client, message) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      // Destino fuera del mapa => se encierra en bounds, no se rechaza.
      player.target = clampToBounds({ x: message.x, z: message.z }, movement.mapHalfExtent);
    });

    this.onMessage(MSG.Pong, pongSchema, (client, message) => {
      console.log(`[game] pong de ${client.sessionId} — rtt ${Date.now() - message.t}ms`);
    });

    this.setSimulationInterval((dtMs) => {
      const maxStep = movement.speedUnitsPerSecond * (dtMs / 1000);
      for (const player of this.players.values()) {
        player.pos = stepToward(player.pos, player.target, maxStep);
      }
    }, 1000 / net.simulationTickHz);

    this.clock.setInterval(() => {
      if (this.players.size === 0) return;
      const snapshot: StatePayload = { p: this.playerTuples() };
      this.broadcast(MSG.State, snapshot);
    }, 1000 / net.snapshotHz);
  }

  override onJoin(client: Client): void {
    const { mapHalfExtent } = getGameConfig().world.movement;
    // Spawn disperso cerca del centro para que dos clientes no se solapen.
    const spawn: Vec2 = clampToBounds(
      { x: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 },
      mapHalfExtent,
    );
    this.players.set(client.sessionId, { pos: spawn, target: spawn });
    console.log(
      `[game] join ${client.sessionId} en (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)})`,
    );

    const welcome: WelcomePayload = {
      v: PROTOCOL_VERSION,
      id: client.sessionId,
      players: this.playerTuples(),
      snapshotHz: getGameConfig().world.net.snapshotHz,
    };
    client.send(MSG.Welcome, welcome);

    const ping: PingPayload = { v: PROTOCOL_VERSION, t: Date.now() };
    client.send(MSG.Ping, ping);

    const enter: EnterPayload = { p: this.tupleOf(client.sessionId) };
    this.broadcast(MSG.Enter, enter, { except: client });
  }

  override onLeave(client: Client): void {
    this.players.delete(client.sessionId);
    console.log(`[game] leave ${client.sessionId}`);
    const exit: ExitPayload = { id: client.sessionId };
    this.broadcast(MSG.Exit, exit);
  }

  private playerTuples(): PlayerTuple[] {
    return [...this.players.keys()].map((id) => this.tupleOf(id));
  }

  private tupleOf(id: string): PlayerTuple {
    const player = this.players.get(id);
    if (!player) throw new Error(`jugador inexistente: ${id}`);
    return [id, player.pos.x, player.pos.z];
  }
}
