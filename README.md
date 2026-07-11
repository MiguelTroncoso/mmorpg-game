# RPG de fantasía (Unity)

Prototipo de RPG de acción para Android en Unity 6000.5.3f1, con servidor
WebSocket Node.js para juego online local. Inspirado en las mecánicas
generales de los MMORPG clásicos, con contenido original.

- **Arquitectura:** ver [`GAME_ARCHITECTURE.md`](GAME_ARCHITECTURE.md)
- **Contrato de desarrollo:** ver [`CLAUDE.md`](CLAUDE.md)

## Subir el proyecto Unity existente a este repo

El prototipo (fases 1–5.6) vive localmente en `~/Documents/Mmorpg`. Para
subirlo aquí:

```bash
cd ~/Documents/Mmorpg
git init                      # si aún no es repo git
git remote add origin git@github.com:MiguelTroncoso/mmorpg-game.git   # o ajustar la URL
git fetch origin
git checkout -b claude/fantasy-rpg-architecture-5d2uhf origin/claude/fantasy-rpg-architecture-5d2uhf 2>/dev/null \
  || git checkout claude/fantasy-rpg-architecture-5d2uhf
# copiar/mergear los archivos del proyecto, luego:
git add -A
git commit -m "Import Unity prototype (phases 1-5.6)"
git push -u origin claude/fantasy-rpg-architecture-5d2uhf
```

El `.gitignore` de este repo ya excluye `Library/`, `Temp/`, `Logs/`,
`UserSettings/`, builds y `node_modules/` — no subir esas carpetas.

## Ejecutar

- Abrir `Assets/Scenes/Prototype.unity` en Unity y dar Play.
- Servidor local: `cd Server && npm install && npm start` y conectar desde
  Unity a `ws://localhost:7777` (usar la IP local del equipo para probar en
  un teléfono físico).
