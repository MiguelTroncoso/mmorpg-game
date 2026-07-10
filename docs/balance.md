# docs/balance.md — Sistema de Mejora (+0 → +15)

> **Este archivo documenta el *razonamiento*. Los números vivos están en
> `server/config/upgrade.json` y se cargan en runtime.** Nunca hardcodear la tabla.
> Todo cambio de balance se registra aquí con fecha y motivo.

---

## 1. Tabla base

| Nivel | Éxito | Fallo (sin protección) | Joyas por intento |
|:-----:|:-----:|:----------------------:|:-----------------:|
| +1  | 95% | nada | 1 |
| +2  | 90% | nada | 1 |
| +3  | 85% | nada | 1 |
| +4  | 80% | nada | 1 |
| +5  | 70% | **baja −1** | 2 |
| +6  | 60% | baja −1 | 2 |
| +7  | 50% | baja −1 | 2 |
| +8  | 42% | baja −1 | 3 |
| +9  | 35% | baja −1 | 3 |
| +10 | 28% | **DESTRUYE** | 4 |
| +11 | 22% | DESTRUYE | 4 |
| +12 | 17% | DESTRUYE | 5 |
| +13 | 12% | DESTRUYE | 6 |
| +14 | 8%  | DESTRUYE | 8 |
| +15 | 5%  | DESTRUYE | 10 |

**Tres zonas, y esto es intencional:**
- **+1..+4 — zona segura.** El fallo solo consume joyas. Enseña la mecánica sin castigar.
- **+5..+9 — zona de desgaste.** El fallo retrocede un nivel. Frustra, no destruye.
- **+10..+15 — zona de riesgo.** El fallo destruye el ítem. Aquí vive la adrenalina.

Las joyas se consumen **siempre**, éxito o fallo.

---

## 2. Ítems de protección

| Ítem | Efecto en el fallo | Rango válido | Rareza objetivo |
|---|---|:---:|---|
| **Ancla de Hierro** | En vez de destruir → **baja −1** | **+10 a +15** | Poco común |
| **Sello de Preservación** | El ítem **se mantiene** en su nivel actual | **+5 a +12** | Muy raro |

Ambos se consumen en cada intento donde se equipan, gane o pierda.

### ⚠️ Por qué el Sello tiene tope en +12

Si el Sello funcionara hasta +15, el sistema deja de existir. Simulación exacta
(cadena de Markov, no muestreo):

| Objetivo | Joyas | Sellos | Ítems destruidos |
|---|---:|---:|---:|
| +15 con Sello ilimitado | 70 | 65 | **0** |

Cero riesgo. Cero pérdida. El "+15" pasa a ser una función lineal de cuántos Sellos
posees, es decir, de cuánto pagaste. **El loop central del juego colapsa en una tienda.**

Con el tope en +12, arriba de ese punto solo existe el Ancla, que no evita perder
progreso — solo evita perder el ítem. El +15 sigue siendo un logro.

### Hallazgo clave

> **Las probabilidades de éxito casi no importan comparadas con la disponibilidad
> de las protecciones.** El drop rate del Sello es la perilla real de dificultad
> del juego, no el 35% del +9. Trátalo como tal.

---

## 3. Costos esperados (valor exacto, con joyas escaladas)

Política: Sello en +5..+12, Ancla en +13..+15. Partiendo de +0.

| Objetivo | Joyas | Sellos | Anclas |
|---|---:|---:|---:|
| +9  | 30 | 10 | 0 |
| +11 | 63 | 18 | 0 |
| +12 | 92 | 24 | 0 |
| +13 | 358 | 67 | 8 |
| +14 | 3.513 | 564 | 117 |
| +15 | **63.666** | 9.989 | 2.195 |

**Jugador sin protección alguna (F2P puro), desde +0:**

| Objetivo | Joyas | Ítems destruidos |
|---|---:|---:|
| +9  | 44 | 0 |
| +10 | 160 | 2,6 |
| +11 | 732 | 15,2 |
| +12 | 4.311 | 94,5 |
| +13 | 35.931 | 794,8 |

Lectura: **+9 es alcanzable para cualquiera.** +11 requiere compromiso. +13 requiere
protecciones. **+15 debe ser noticia en el servidor** — un puñado de ítems por temporada,
con anuncio global cuando alguien lo logra. Ese anuncio es contenido gratis: crea deseo.

---

## 4. Pity system (anti-frustración)

Sin esto, un jugador puede fallar 12 veces seguidas en +7 y desinstalar. La cola
estadística existe y siempre le toca a alguien.

- Cada fallo consecutivo **en el mismo nivel** suma **+3%** absoluto a la probabilidad.
- Tope acumulado: **+15%**.
- Se resetea al éxito, o al cambiar de ítem.
- **El contador vive en el servidor, atado al ítem.** Nunca en el cliente.

No se anuncia al jugador. Es una red de seguridad invisible.

---

## 5. Reglas de implementación (no negociables)

1. **La mejora es UNA transacción de base de datos.** Consumir joyas + protección,
   resolver RNG, escribir resultado. Si algo revienta, rollback total.
   Este es el punto #1 de duplicación de ítems en servidores de MU.
2. **El RNG vive en el servidor.** Semilla criptográfica. El cliente solo anima el resultado.
3. El cliente envía `{ itemInstanceId, protectionId? }`. Nada más. Ni el nivel, ni la
   probabilidad, ni el resultado.
4. Validar en el servidor que la protección aplica al rango. Un cliente modificado
   intentará usar Sello en +15.
5. **Rate limit por cuenta.** Un bot puede quemar 10.000 intentos por minuto.
6. Log de auditoría de cada intento: `userId, itemId, from, to, result, protection, timestamp`.
   Cuando aparezca el primer duplicador, esto es lo único que te salvará.

---

## 6. Monetización — leer antes de diseñar la tienda

Si el Sello es la principal compra dentro de la app, el juego es **pay-to-not-lose**.
Funciona comercialmente y es exactamente lo que hace medio género. Dos consecuencias
que debes asumir con los ojos abiertos:

- **Google Play exige divulgar las probabilidades** de mecánicas aleatorias pagadas
  antes de la compra. Si vendes Sellos, la tabla de la sección 1 debe ser pública en
  la ficha o dentro del juego. Diseñar con eso desde ahora, no parchear después.
- Un juego donde el +13 es inalcanzable sin pagar pierde a los F2P, y sin F2P no hay
  a quién impresionar con tu +15. **La economía de estatus necesita espectadores.**
  Deja el Sello caer de jefes y eventos, no solo de la tienda.

Recomendación: Ancla → drop común de mazmorras. Sello → drop raro de jefes + compra.
Nunca vendas éxito garantizado.

---

## 7. Perillas de tuneo, en orden de impacto

1. Drop rate del **Sello** ← la más poderosa, con diferencia
2. Rango válido del Sello (+12 → +9 endurece el juego brutalmente)
3. Drop rate del **Ancla**
4. Joyas por intento en +13..+15
5. Probabilidades de la tabla ← la menos importante, contra la intuición

**No toques la #5 primero.** Siempre es la que todos quieren tocar.

---

## Registro de cambios

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-07-08 | Versión inicial. Sello limitado a +12. | Simulación mostró que sin tope el sistema colapsa (0 riesgo, 0 ítems perdidos). |
