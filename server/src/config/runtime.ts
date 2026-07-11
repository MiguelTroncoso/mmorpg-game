import type { GameConfig } from "./load.js";

/**
 * Config activa del proceso. Se setea UNA vez en el boot (o en el setup de un
 * test) antes de crear el servidor. Las rooms la leen de aquí: así la config
 * jamás viaja por opciones de matchmaking, donde un cliente podría inyectarla.
 */
let active: GameConfig | undefined;

export function setGameConfig(config: GameConfig): void {
  active = config;
}

export function getGameConfig(): GameConfig {
  if (!active) {
    throw new Error(
      "getGameConfig() antes de setGameConfig() — el boot debe cargar config primero",
    );
  }
  return active;
}
