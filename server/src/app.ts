import { defineServer, defineRoom, type Server } from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";

/**
 * Construye el servidor Colyseus. Separado de index.ts para poder testearlo.
 * Requiere setGameConfig() previo (ver src/config/runtime.ts).
 */
export function createGameServer(): Server {
  return defineServer({
    greet: false,
    rooms: {
      game: defineRoom(GameRoom),
    },
    express: (app) => {
      app.get("/health", (_req, res) => {
        res.status(200).json({ status: "ok" });
      });
    },
  });
}
