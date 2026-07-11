import { loadGameConfig } from "./config/load.js";
import { setGameConfig } from "./config/runtime.js";
import { createGameServer } from "./app.js";

// Config primero: si el balance es inválido, esto termina el proceso antes de
// abrir ningún puerto (ver src/config/load.ts).
const config = loadGameConfig();
setGameConfig(config);
console.log(
  `[config] upgrade v${config.upgrade.version} (${config.upgrade.levels.length} niveles), ` +
    `excellent v${config.excellent.version} (${Object.keys(config.excellent.pools).length} pools), ` +
    `world v${config.world.version} — OK`,
);

const port = Number(process.env.PORT ?? 2567);
const gameServer = createGameServer();

await gameServer.listen(port);
console.log(`[server] escuchando en :${port}`);
