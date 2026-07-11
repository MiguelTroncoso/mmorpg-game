# CLAUDE.md — Proyecto: RPG de fantasía (Unity)

> Contrato del proyecto. Claude Code lo lee al iniciar cada sesión.
> La arquitectura de referencia vive en `GAME_ARCHITECTURE.md` — leerla antes
> de escribir código nuevo.

## Qué es este proyecto

RPG de acción en tercera persona / isométrico para Android, hecho en **Unity
(6000.5.3f1) + C#**, inspirado en las mecánicas generales de MU Online y
Metin2 (progresión 1–105, mejora de items +0..+15 con riesgo, clases, zonas
por rango de nivel) pero con **identidad, nombres, historia y contenido 100 %
originales**. Preparado para multijugador (existe un servidor WebSocket
Node.js en `Server/`).

Estado: existe un prototipo con fases 1–5.6 (movimiento, combate, 4 clases,
EXP/oro/loot, online local, inventario, mejora, Android-ready, creación de
personaje, avatar procedural). La escena se genera en runtime desde
`Assets/Scripts/Core/PrototypeBootstrap.cs`.

## Reglas no negociables

1. **Leer antes de escribir.** Revisar `README.md`, `GAME_ARCHITECTURE.md`,
   `docs/` y el código existente relacionado antes de tocar nada. No duplicar
   ni reescribir sistemas funcionales sin explicar el motivo.
2. **Datos en ScriptableObjects/JSON, nunca en código.** Curvas de EXP,
   stats, probabilidades de mejora, tablas de botín, colores de rareza.
3. **Separación datos / lógica / presentación.** La UI escucha eventos; no
   hace polling ni contiene reglas de juego.
4. **Definición vs instancia**: los ScriptableObjects no mutan en runtime.
5. **Reglas críticas como funciones puras** (daño, mejora, EXP): testeables
   sin escena y portables al servidor.
6. **Guardado**: JSON local vía `ISaveStorage`; PlayerPrefs solo para
   settings. Nada del estado principal del jugador en PlayerPrefs.
7. **Textos visibles al jugador**: claves i18n preparadas para español, nunca
   literales concatenados.
8. **Código en inglés** (clases, métodos, variables). Commits en imperativo,
   en inglés. Una tarea, un commit.
9. **Sin paquetes externos ni assets nuevos sin avisar.** Solo licencias
   CC0/MIT/propias, documentadas en `ASSET_LICENSES.md`.
10. **Una etapa a la vez** (ver hoja de ruta en `GAME_ARCHITECTURE.md` §16).
    No avanzar si la etapa anterior no compila y funciona en Play.
11. Si una tarea es ambigua, **preguntar antes de asumir**.

## Cómo probar

- Abrir `Assets/Scenes/Prototype.unity` y dar Play.
- Server online local: `cd Server && npm install && npm start`, conectar
  desde Unity a `ws://localhost:7777` (IP local del equipo para móvil físico).
- No intentar build Android real si falta `PlaybackEngines/AndroidPlayer`.
