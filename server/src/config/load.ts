import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  excellentConfigSchema,
  upgradeConfigSchema,
  worldConfigSchema,
  type ExcellentConfig,
  type UpgradeConfig,
  type WorldConfig,
} from "./schemas.js";

export interface GameConfig {
  upgrade: UpgradeConfig;
  excellent: ExcellentConfig;
  world: WorldConfig;
}

/**
 * Carga y valida server/config/*.json. Falla ruidosamente: si un archivo falta,
 * no parsea o viola un invariante, el proceso termina con exit code 1 y un error
 * legible. Un servidor con balance inválido no debe arrancar jamás.
 */
export function loadGameConfig(configDir = path.join(process.cwd(), "config")): GameConfig {
  return {
    upgrade: loadOne(configDir, "upgrade.json", upgradeConfigSchema),
    excellent: loadOne(configDir, "excellent.json", excellentConfigSchema),
    world: loadOne(configDir, "world.json", worldConfigSchema),
  };
}

function loadOne<T>(configDir: string, filename: string, schema: z.ZodType<T>): T {
  const filePath = path.join(configDir, filename);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    fail(filePath, `no se pudo leer el archivo: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(filePath, `JSON inválido: ${String(err)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    fail(filePath, z.prettifyError(result.error));
  }
  return result.data;
}

function fail(filePath: string, detail: string): never {
  console.error(`\n[config] FATAL: ${filePath}\n${detail}\n`);
  console.error("[config] El servidor no arranca con configuración inválida. Corrige y reintenta.");
  process.exit(1);
}
