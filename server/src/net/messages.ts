import { z } from "zod";
import type { MovePayload, PongPayload } from "../../../shared/protocol/messages.js";

/**
 * Validación zod de TODO mensaje entrante del cliente. El cliente es hostil por
 * definición: nada entra a una room sin pasar por un schema de este archivo.
 * (zod v4 implementa Standard Schema, así que estos schemas se pasan directo a
 * `room.onMessage(tipo, schema, cb)` y Colyseus valida antes del callback.)
 */

export const pongSchema = z.object({
  t: z.number().int().nonnegative(),
});

// Intención de movimiento: coordenadas finitas. Los límites del mapa NO se
// validan aquí — el servidor las encierra en bounds (un destino fuera del mapa
// es input legal de un tap en el borde, no un ataque).
export const moveSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
});

// Las formas validadas deben coincidir con el contrato de /shared/protocol.
type _PongMatches = z.infer<typeof pongSchema> extends PongPayload ? true : never;
const _pongMatches: _PongMatches = true;
void _pongMatches;
type _MoveMatches = z.infer<typeof moveSchema> extends MovePayload ? true : never;
const _moveMatches: _MoveMatches = true;
void _moveMatches;
