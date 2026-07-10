# /domain — lógica pura

Regla de CLAUDE.md §3, sin excepciones:

- **Nada en esta carpeta importa Colyseus, Prisma, Redis, Express ni red.**
- Solo funciones puras y tipos: cálculo de daño, tabla de upgrade, fórmula de EXP,
  drop tables, etc.
- Todo módulo de aquí debe poder ejecutarse en un test unitario sin levantar
  servidor, base de datos ni sockets.
- Los números de balance entran como **parámetros** (cargados desde
  `server/config/*.json` por la capa de arriba). Jamás hardcodeados aquí.

Si un módulo de `/domain` necesita I/O, no va en `/domain`.
