# docs/excellent.md — Sistema de Opciones Excellent

> Complementa `docs/balance.md` (sistema de mejora). Números vivos en
> `server/config/excellent.json`. **No hardcodear.**
>
> **Relación entre los dos sistemas:** el upgrade es el *sink* (quema recursos),
> excellent es el *anzuelo* (crea el ítem que vale la pena arriesgar).
> Uno no funciona sin el otro.

---

## 1. Principio rector

**El chase es la CANTIDAD de opciones, no la calidad de cada una.**

Los valores de cada opción son **fijos**. No hay rangos aleatorios.

Razones, en orden de peso:
1. **Legibilidad móvil.** Un tooltip con 6 rangos variables es ilegible en un teléfono.
2. **Mercado.** Si nadie puede evaluar un ítem de un vistazo, nadie comercia. Sin comercio,
   no hay economía. Sin economía, el farmeo no tiene salida.
3. **Comunicación social.** "Tengo un arma exc de 5" es una frase que se dice en el chat.
   "Tengo un arma con 4.2% de daño y 6.8 de velocidad" no lo es.

Un ítem de 6 opciones tiene **todas** las opciones del pool. No hay ambigüedad sobre
qué es el ítem perfecto. Eso es una virtud, no una limitación.

---

## 2. Pools de opciones (6 por tipo de slot)

Cada slot tiene un pool cerrado de exactamente 6. Se sortean **sin reemplazo**.

### Armas
| # | Opción | Valor |
|---|---|---|
| 1 | Daño aumentado | +2% |
| 2 | Tasa de golpe excelente | +10% |
| 3 | Velocidad de ataque | +7 |
| 4 | Daño según nivel | +nivel/20 |
| 5 | Roba vida al matar | vida máx / 8 |
| 6 | Roba maná al matar | maná máx / 8 |

### Armaduras (casco, pechera, guantes, pantalón, botas)
| # | Opción | Valor |
|---|---|---|
| 1 | Vida máxima | +4% |
| 2 | Maná máximo | +4% |
| 3 | Reducción de daño recibido | +4% |
| 4 | Tasa de defensa | +10% |
| 5 | Refleja daño | 5% |
| 6 | Zen obtenido al matar | +40% |

### Escudos
| # | Opción | Valor |
|---|---|---|
| 1 | Vida máxima | +4% |
| 2 | Tasa de bloqueo | +10% |
| 3 | Reducción de daño recibido | +4% |
| 4 | Defensa según nivel | +nivel/20 |
| 5 | Refleja daño | 5% |
| 6 | Recupera vida al bloquear | vida máx / 12 |

> **Nota de identidad:** estos pools son un punto de partida funcional. Cambia nombres
> y al menos dos efectos por pool para que el juego tenga carácter propio y no sea
> un clon reconocible. Las mecánicas no son propiedad de nadie; la identidad sí importa.

---

## 3. Distribución de cantidad de opciones

Dado que un ítem es excellent, cuántas opciones trae:

| Opciones | Probabilidad |
|:---:|---:|
| 1 | 64,0% |
| 2 | 23,0% |
| 3 | 9,0% |
| 4 | 3,0% |
| 5 | 0,8% |
| 6 | 0,2% |

Cadena completa: `kill → 8% suelta equipo → 4% es excellent → cantidad de opciones`

---

## 4. Rareza real (calculada, no estimada)

| Opciones | Kills por 1 (cualquier slot) | Kills para un slot específico | Horas @30 kills/min |
|:---:|---:|---:|---:|
| 1 | 488 | 3.906 | 0,3 |
| 2 | 1.359 | 10.870 | 0,8 |
| 3 | 3.472 | 27.778 | 1,9 |
| 4 | 10.417 | 83.333 | 5,8 |
| 5 | 39.062 | 312.500 | 21,7 |
| 6 | **156.250** | **1.250.000** | 86,8 |

**Lectura de diseño:**
- Un jugador de 100 horas tiene **99,7%** de haber visto un excellent de 5+ opciones.
  El sueño es visible, no teórico. Eso es lo que retiene.
- Un 6-opciones **en el slot que necesitas** son ~700 horas. Nadie lo farmea con intención.
  Aparece un puñado de veces por temporada en todo el servidor.
- Cuando caiga uno: **anuncio global**. Es contenido gratis. Crea deseo en 500 personas
  a la vez.

---

## 5. Bonos de conjunto (la pieza que la gente olvida)

Sin esto, un excellent de 1 opción es basura y el 96% de los drops excellent no valen nada.
Con esto, **todo excellent tiene un uso**, y ese es el motor del farmeo diario.

Cuenta **piezas equipadas que sean excellent**, sin importar cuántas opciones tenga cada una:

| Piezas exc. equipadas | Bono |
|:---:|---|
| 2 | +5% tasa de defensa |
| 3 | +15 defensa |
| 4 | +5% daño |
| 5 | +5% vida máxima |
| 6 | +10% tasa de golpe excelente |
| 7 (set completo) | +7% a todos los stats |

**Consecuencia intencional:** un excellent de 1 opción que llena un hueco vale más que
un excellent de 4 opciones en un slot que ya tienes cubierto. Eso genera comercio real
entre jugadores, no solo venta a NPCs.

---

## 6. Reajuste de opciones

**Piedra de Reajuste** — reroll de **UNA** opción, elegida por el jugador.
La reemplaza por otra del pool que el ítem no tenga.

- **La cantidad de opciones NUNCA cambia.**
- No existe, y no debe existir, ningún ítem que **añada** una opción.

### ⚠️ Por qué nunca vender cantidad de opciones

Si existe un ítem que sube un exc de 4 a 5 opciones, la cantidad deja de ser rara y
pasa a ser un precio. Los 1.250.000 kills de la tabla de arriba se convierten en una
transacción con tarjeta. **Toda la sección 4 de este documento deja de significar algo**,
y con ella el anuncio global, el chat, y la razón por la que alguien juega mañana.

Es exactamente el mismo error que el Sello sin tope en `balance.md`. El patrón se repite:
*vender la eliminación de la varianza destruye el sistema construido sobre la varianza.*

---

## 7. Invariante de poder (crítico para PvP)

> **Un ítem excellent de 6 opciones nunca debe valer más que 3 niveles de mejora.**
>
> Es decir: `+13 normal` gana a `+9 exc 6-opciones`.

Si excellent supera al upgrade, nadie arriesga ítems en +13 y el sink muere.
Si el upgrade supera demasiado a excellent, los drops no emocionan y el anzuelo muere.

**Contribución objetivo del excellent al poder efectivo total: +15% a +18% máximo
con 6 opciones.** Auditar esto con un script cada vez que se toque cualquiera de las
dos tablas. Es la primera cosa que se rompe silenciosamente.

---

## 8. Interacción con el sistema de mejora

Son **ortogonales**. Un ítem excellent usa exactamente la misma tabla de probabilidad
de `balance.md`. Sin descuentos, sin protección extra.

Sí: **un excellent de 5 opciones puede destruirse intentando +13.**

Eso no es un bug de diseño. Es la mejor historia que tu juego puede generar, y va a
correr por todo el servidor. No la suavices.

---

## 9. Presentación en móvil (restricción real)

Seis líneas de opciones no caben cómodamente en un tooltip de teléfono.

- **Color del nombre del ítem según cantidad de opciones.** El jugador identifica la
  rareza sin leer nada. Esta es la decisión de UI más importante del sistema.
- Tooltip corto por defecto (nombre + nivel + cantidad de opciones), expandible al tocar.
- En el suelo, un excellent de 4+ debe tener efecto de partículas distinto. La emoción
  ocurre **antes** de recogerlo.

---

## 10. Implementación

1. El sorteo de opciones ocurre **en el servidor, al generar el drop**. Nunca al recoger.
   Si ocurre al recoger, un cliente modificado puede reintentar.
2. La instancia del ítem guarda `optionIds: number[]`. Los valores se resuelven desde
   config al calcular stats — **nunca se persisten los valores**, solo los IDs.
   Así puedes rebalancear sin migrar la base de datos.
3. El servidor calcula todos los stats derivados. El cliente solo los muestra.
4. Log de auditoría de cada drop con 4+ opciones. Cuando alguien duplique, lo verás ahí.

---

## Registro de cambios

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-07-08 | Versión inicial. Valores fijos, sin rangos. Reroll sin cambio de cantidad. | Legibilidad móvil y protección de la rareza como eje económico. |
