import { defineServer, defineRoom, type Server } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom.js";

/** Construye el servidor Colyseus. Separado de index.ts para poder testearlo. */
export function createGameServer(): Server {
  return defineServer({
    greet: false,
    rooms: {
      lobby: defineRoom(LobbyRoom),
    },
    express: (app) => {
      app.get("/health", (_req, res) => {
        res.status(200).json({ status: "ok" });
      });
    },
  });
}
