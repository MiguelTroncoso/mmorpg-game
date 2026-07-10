import { z } from "zod";
import type { PongPayload } from "../../../shared/protocol/messages.js";

/**
 * Validación zod de TODO mensaje entrante del cliente. El cliente es hostil por
 * definición: nada entra a una room sin pasar por un schema de este archivo.
 * (zod v4 implementa Standard Schema, así que estos schemas se pasan directo a
 * `room.onMessage(tipo, schema, cb)` y Colyseus valida antes del callback.)
 */

export const pongSchema = z.object({
  t: z.number().int().nonnegative(),
});

// La forma validada debe coincidir con el contrato de /shared/protocol.
type _PongMatches = z.infer<typeof pongSchema> extends PongPayload ? true : never;
const _pongMatches: _PongMatches = true;
void _pongMatches;
