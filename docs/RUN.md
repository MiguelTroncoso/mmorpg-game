# Cómo prender AETHER (Fase 0)

Dos piezas: el **servidor** (Docker o Node directo) y el **cliente** (Godot).
Criterio de Fase 0: dos clientes conectados ven moverse la cápsula del otro.

---

## 1. Servidor

### Opción A — Docker (la definitiva)

Requisitos: Docker Desktop (Win/Mac) o docker + compose plugin (Linux).

```bash
cd infra
docker compose up --build
```

Primera vez tarda (descarga postgres/redis y compila el server). Listo cuando
aparece `[server] escuchando en :2567`.

### Opción B — Node directo (más rápida para iterar)

Requisitos: Node 20+.

```bash
cd server
npm install
npm run dev
```

(Postgres y Redis aún no se usan en Fase 0 — el server corre solo.)

### Verificar

```bash
curl http://localhost:2567/health
# → {"status":"ok"}

cd server && npm test
# → 8 tests en verde (dominio + protocolo byte a byte)
```

---

## 2. Cliente (desktop, para probar ya)

1. Instalar **Godot 4.4.x** (https://godotengine.org/download — el normal, no .NET).
2. Abrir Godot → **Import** → elegir `client/project.godot` → Import & Edit.
   La primera importación genera `.godot/` y las traducciones; si la consola
   muestra warnings de archivos `.translation` la primera vez, cerrar y reabrir
   el editor una vez.
3. Con el servidor corriendo, presionar **F5** (Run).
4. Deberías ver: plano verde oscuro, **tu cápsula azul**, y arriba
   "Conectado — Toca el suelo para moverte".
5. Click en el suelo → la cápsula camina hacia ahí (lo mueve el servidor).

**La prueba multijugador real:** correr **dos instancias**. En el editor:
Debug → *Run Multiple Instances* → 2, y F5. O abrir el proyecto dos veces.
Cada instancia es un jugador; uno se mueve y el otro lo ve moverse (gris).

---

## 3. Cliente en Android físico

1. En Godot: Editor → Manage Export Templates → descargar templates 4.4.x.
2. Project → Export → Add → **Android**. Requisitos de la doc oficial:
   Android Studio (SDK) + JDK 17, y configurar sus rutas en
   Editor Settings → Export → Android. Habilitar **USB debugging** en el
   teléfono.
3. **Antes de exportar:** en `scenes/main.tscn`, seleccionar el nodo `Main` y
   cambiar `Server Host` a la IP LAN de tu PC, ej. `192.168.1.50:2567`
   (el teléfono no puede ver `127.0.0.1`). PC y teléfono en el mismo Wi-Fi.
4. Export Project → APK (para pruebas; el AAB es solo para subir a Play).
   Con el teléfono conectado por USB:

```bash
adb install -r aether.apk
```

   O directamente el botón de Android (deploy con un click) en el editor.

### Qué esperar que falle (y cómo leerlo)

| Síntoma | Causa probable |
|---|---|
| "Error de conexión HTTP" | IP equivocada en `server_host`, firewall de la PC bloqueando el puerto 2567, o teléfono en otra red |
| "Buscando sala…" eterno | El servidor no está corriendo, o el compose no expuso el puerto |
| Export falla por keystore | Falta el debug keystore: Editor Settings → Export → Android lo genera |
| App abre y cierra | Ver `adb logcat -s godot` — usualmente falta el permiso INTERNET (viene activado por defecto en el preset, verificar en Export → Options → Permissions) |

---

## 4. Cerrar el loop de Fase 0

Un teléfono + el desktop (o dos teléfonos): mover una cápsula y verla moverse
en la otra pantalla con latencia tolerable en Wi-Fi/4G. Cuando eso pase,
la Fase 0 queda cerrada y se documenta en `docs/decisions/002-fase0-cierre.md`
qué aprendimos antes de arrancar la Fase 1 (auth + mapa + mobs + combate).
