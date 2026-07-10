# CLAUDE.md — Proyecto: MMORPG (nombre provisional: `AETHER`)

> Este archivo es el contrato del proyecto. Claude Code lo lee al iniciar cada sesión.
> **No implementes nada fuera de la fase activa.** Si detectas que una tarea pertenece
> a una fase futura, dilo y detente en vez de improvisar.

---

## 1. Visión

MMORPG isométrico 3D para Android (Play Store, AAB), inspirado en **MU Online** (progresión
de items, +upgrade con fallo, alas, PK) y **Metin2** (mapas orientales, piedras de mejora,
reinos/facciones). Multiidioma desde el día 1 (ES, EN, PT-BR).

**Loop central que define el juego:**
1. Matar mobs → drop de items y joyas
2. Mejorar items (+0 a +15) con **probabilidad de fallo y riesgo de destrucción**
3. Item mejorado → acceso a mapas de mayor nivel → mejores drops
4. Presión social: PK, gremios, ranking visible

Todo lo demás (monturas, mascotas, bodas, atuendos) es **contenido encima de este loop**.
Si el loop no engancha, nada más importa.

---

## 2. Stack (no cambiar sin discusión explícita)

### Cliente
- **Godot 4.x**, GDScript (C# solo si hay razón medida)
- Export: Android AAB, `minSdk 24`, target el API level vigente que exija Play
- Renderer: **Mobile** (no Forward+). Vulkan con fallback GL Compatibility
- Cámara isométrica fija, tap-to-move + joystick virtual

### Servidor
- **Node 20 + TypeScript** (strict mode, sin `any`)
- **Colyseus** para rooms autoritativas y state sync
- **PostgreSQL 16 + Prisma** (persistencia)
- **Redis** (sesiones, presencia, rate limits, leaderboards)
- **Docker Compose**, deploy en VPS Hetzner

### Comunicación Godot ↔ Colyseus
Existe un cliente Colyseus para Godot mantenido por la comunidad. **Evaluarlo en Fase 0.**
Si está desactualizado o inestable, el fallback es **`WebSocketPeer` nativo de Godot +
MessagePack** sobre un protocolo propio. Decidir esto ANTES de escribir gameplay.

### Reglas no negociables
- **Servidor autoritativo.** El cliente nunca envía daño, posición final, ni loot.
  El cliente envía *intención* (`move_to`, `cast_skill`), el servidor decide.
- **Nada de lógica de balance en el cliente.**
- Todo string visible al jugador es una **clave de i18n**, nunca texto literal.
  El servidor envía `error.inventory_full`, no "Inventario lleno".

---

## 3. Estructura del repo

```
/server
  /src
    /rooms          # Colyseus rooms (GameRoom, LobbyRoom)
    /schema         # Colyseus @type state schemas
    /systems        # combat, loot, upgrade, movement, ai
    /domain         # lógica pura, sin I/O — testeable
    /db             # prisma client, repositorios
    /net            # protocolo, validación de mensajes (zod)
  /prisma
  /tests
/client
  /scenes
  /scripts
  /assets
  /i18n             # translations.csv
/shared
  /protocol         # definiciones de mensajes compartidas
/infra
  docker-compose.yml
/docs
  /decisions        # ADRs — una decisión por archivo
```

**`/domain` no importa nada de Colyseus, Prisma ni red.** Es lógica pura con tests.
Ahí vive el cálculo de daño, la tabla de upgrade, la fórmula de EXP. Debe correr en
un test unitario sin levantar servidor.

---

## 4. Fases (una a la vez, en orden)

### Fase 0 — Cimientos ✅ empezar aquí
- [ ] Scaffold del monorepo, TS strict, ESLint, Prettier
- [ ] `docker-compose.yml`: postgres, redis, server
- [ ] Colyseus arrancando, healthcheck HTTP
- [ ] Proyecto Godot vacío que **conecta y recibe un ping** del servidor
- [ ] Decisión documentada en `/docs/decisions/001-transport.md`: Colyseus SDK vs WebSocket crudo
- [ ] Export APK de prueba que corre en un Android real

**Criterio de salida:** un cubo se mueve en un teléfono y otro teléfono ve el cubo moverse.
Nada más. Sin arte, sin UI.

### Fase 1 — Vertical slice
- [ ] Auth: device-id + email opcional, JWT, refresh
- [ ] Un mapa (Lorencia-like), navmesh, colisiones
- [ ] Un personaje, movimiento sincronizado con interpolación y reconciliación
- [ ] 3 tipos de mob, IA básica (idle → aggro → chase → attack → leash)
- [ ] Combate melee autoritativo, HP, muerte, respawn
- [ ] EXP y niveles (curva 1-30), stats (STR/AGI/VIT/ENE) con puntos asignables
- [ ] AOI (area of interest): solo sincronizar entidades cercanas

**Criterio de salida:** 20 minutos de matar mobs y subir nivel se sienten bien.
**Si no se siente bien, NO avanzar. Iterar aquí.**

### Fase 2 — Items y persistencia
- [ ] Schema de items (base + instancia con opciones aleatorias)
- [ ] Drop tables por mob, loot al suelo, pickup
- [ ] Inventario en grid (estilo MU: items ocupan celdas)
- [ ] Equipamiento, cálculo de stats derivados
- [ ] Guardado en Postgres, transaccional. **Cero duplicación de items.**

### Fase 3 — El loop que engancha ⭐
- [ ] Joyas (Bendición/Alma/Caos) y piedras de mejora
- [ ] Upgrade +0..+15 con tabla de probabilidad y **riesgo de destrucción**
- [ ] Opciones "excellent" con probabilidad al drop
- [ ] NPCs: tienda, reparación, almacén (baúl)
- [ ] Ranking global (Redis sorted set)

**Aquí se decide si el juego existe.** Métrica: ¿los testers vuelven al día siguiente?

### Fase 4 — Contenido
- [ ] Mapas 2-4, gating por nivel
- [ ] Misiones (cadena principal + repetibles diarias)
- [ ] Segunda y tercera clase de personaje
- [ ] Habilidades y árbol de skills
- [ ] Mazmorra con jefe

### Fase 5 — Social
- [ ] Chat (global, mapa, susurro, gremio) con filtro y rate limit
- [ ] Lista de amigos, presencia
- [ ] Grupo/party, reparto de EXP y loot
- [ ] Gremios, guerra de gremios
- [ ] PK, karma, penalización por muerte

### Fase 6 — Cosmética y vínculos
- [ ] Alas (tiers, stats + visual)
- [ ] Monturas, mascotas (con o sin efecto de combate — decidir)
- [ ] Atuendos / skins de equipo
- [ ] Bodas: propuesta, ceremonia, buffs de pareja, teleport al cónyuge

### Fase 7 — Producción
- [ ] Telemetría (retención D1/D7, embudo de niveles, dónde abandonan)
- [ ] Anti-cheat: validación de velocidad, cooldowns, rate limits, detección de bots
- [ ] Eventos temporales (drop x2, invasiones)
- [ ] Tienda / monetización

---

## 5. Multiidioma (desde Fase 0)

- Godot: `translations.csv` → `.translation`, `tr("key.name")`
- Servidor: devuelve **claves**, no texto. `{ error: "shop.not_enough_zen", params: { needed: 500 } }`
- Idiomas iniciales: `es`, `en`, `pt_BR`
- Nunca concatenar strings traducidos. Usar placeholders.

---

## 6. Play Store — restricciones reales a tener en cuenta

- Entregable: **AAB**, no APK.
- Si hay **cajas de botín / loot boxes**, Google exige **divulgar las probabilidades**
  antes de la compra. Esto aplica también a la mejora de items si se venden ítems que
  protegen contra el fallo. Diseñar con esto en mente, no parchear después.
- Clasificación de contenido: PK y violencia afectan la edad objetivo.
- Política de datos: si guardas email, necesitas política de privacidad publicada
  y flujo de **borrado de cuenta** (obligatorio).

---

## 7. Convenciones para Claude Code

1. **Una tarea, un commit.** Mensaje en imperativo, en inglés.
2. Antes de escribir código nuevo, **lee el código existente relacionado**. No dupliques.
3. Lógica de gameplay → `/domain` con test unitario. Sin excepciones.
4. Toda decisión de arquitectura no trivial → archivo en `/docs/decisions/`.
5. **No instales dependencias sin justificar** por qué no se resuelve con lo que ya hay.
6. Si una tarea es ambigua, **pregunta antes de asumir**. Es preferible una pregunta
   a 400 líneas en la dirección equivocada.
7. No generes arte, modelos ni sonidos. Son placeholders (cubos, cápsulas) hasta Fase 4.
8. Cada cambio en balance/fórmulas se documenta en `/docs/balance.md` con el razonamiento.
9. El balance vive en `/docs/balance.md`, `/docs/excellent.md` y `server/config/*.json`.
   **Jamás hardcodear números de gameplay.** Los invariantes de esos documentos
   (tope del Sello en +12, reroll sin cambio de cantidad, excellent < 3 niveles de
   upgrade) son restricciones de diseño, no sugerencias. Si una tarea te pide
   violarlos, detente y avisa.

---

## 8. Prompt de arranque (pegar en Claude Code, sesión 1)

```
Lee CLAUDE.md completo antes de tocar nada.

Estamos en Fase 0. Tu única tarea en esta sesión:

1. Investiga el estado actual del cliente Colyseus para Godot 4. Compáralo con usar
   WebSocketPeer nativo + MessagePack. Escribe /docs/decisions/001-transport.md con
   pros, contras y tu recomendación. NO implementes todavía — espera mi confirmación.

2. Una vez confirmado, scaffold del monorepo según la estructura de CLAUDE.md:
   - server: Node 20, TS strict, Colyseus, healthcheck en GET /health
   - infra: docker-compose con postgres 16 y redis 7
   - client: proyecto Godot 4 mínimo, renderer Mobile

3. Criterio de salida de esta sesión: `docker compose up` levanta el servidor,
   `curl localhost:2567/health` responde 200, y el proyecto Godot abre sin errores.

No escribas gameplay. No escribas schemas de items. No toques nada de las Fases 1+.
```

---

## 9. Riesgos conocidos (lee esto cuando quieras rendirte)

- **El arte es el cuello de botella real**, no el código. Presupuesta assets desde ahora
  (Synty, Kenney, KayKit, o un artista). El código no compensa un juego feo.
- **Un MMORPG completo es trabajo de años y de equipo.** Este documento asume que el
  objetivo realista es un *ARPG multijugador persistente de escala pequeña*
  (100-500 concurrentes), no un MMO de 10k.
- **La duplicación de items mata servidores.** Cada operación que mueve un item es una
  transacción de base de datos. Sin excepciones, desde el primer día.
- Los jugadores encontrarán el bug antes que tú. Telemetría temprana, no tardía.
