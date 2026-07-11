# GAME_ARCHITECTURE.md — RPG de fantasía (Unity, C#)

> Documento de arquitectura técnica. Es la referencia obligada antes de escribir
> código nuevo. Los nombres de código (clases, métodos, enums) van en inglés;
> los textos visibles al jugador se preparan para español mediante claves.

---

## 0. Contexto: prototipo existente

Ya existe un prototipo local (Unity **6000.5.3f1**, carpeta local `Mmorpg/`) con
fases 1–5.6 completadas: movimiento, cámara, combate básico, 4 clases
(Guerrero/Ninja/Chamán/Umbra), habilidades Q/E, EXP, oro, loot, servidor
WebSocket Node.js en `Server/`, inventario, misión, mercader, mejora de
arma/armadura, preparación Android, creación de personaje y avatar procedural.
La escena se genera en runtime desde `Assets/Scripts/Core/PrototypeBootstrap.cs`.

**Este documento define la arquitectura objetivo hacia la que evoluciona ese
prototipo.** No es una reescritura: es el plano para extraer los sistemas del
bootstrap monolítico hacia módulos con datos en ScriptableObjects, sin romper
lo que ya funciona. Cada migración se hace por etapas y se valida en Play antes
de continuar.

---

## 1. Resumen de la arquitectura

Tres capas estrictamente separadas:

| Capa | Qué contiene | Regla |
|---|---|---|
| **Datos** | ScriptableObjects (items, enemigos, misiones, tablas de nivel, rarezas, probabilidades de mejora) | Sin lógica de juego; solo definiciones y validación de autoría |
| **Lógica** | Clases C# puras + MonoBehaviours delgados (stats, inventario, combate, progresión, misiones, guardado) | Sin referencias a UI; expone eventos; testeable sin escena |
| **Presentación** | UI, VFX, animaciones, avatar | Solo escucha eventos; nunca calcula reglas de juego |

Principios:

- **Definición vs instancia.** Un `ItemDefinition` (ScriptableObject) describe
  "Espada de hierro"; un `ItemInstance` (clase serializable) describe *tu*
  espada +7 con sus bonos rodados. Los SO nunca mutan en runtime.
- **Eventos C#** (`event Action<T>`) para comunicar lógica → UI. La UI no hace
  polling en `Update`.
- **Interfaces** para comportamientos intercambiables: `IDamageable`,
  `IAttackable`, `IInteractable`, `ILootSource`, `ISaveable`.
- **Fórmulas en datos, no en código.** Curva de EXP, escalado de stats,
  probabilidades de mejora y tablas de botín viven en ScriptableObjects o JSON.
- **Preparado para multijugador:** toda mutación de estado pasa por métodos de
  servicio (`AddExperience`, `EquipItem`, `TryUpgrade`) que hoy ejecutan en
  local y mañana pueden validarse en servidor. La UI jamás muta estado
  directamente.
- **Guardado desacoplado:** interfaz `ISaveStorage` con implementación local
  (JSON en `Application.persistentDataPath`); el reemplazo futuro es un backend
  remoto sin tocar los sistemas de juego. **PlayerPrefs solo para settings.**

### Relaciones entre sistemas

```
LevelProgressionTable ──> CharacterStats <── EquipmentManager <── InventoryManager
        ▲                       │                    ▲                  ▲
        │                       ▼                    │                  │
ExperienceSystem ────> CombatSystem (DamageCalculator)          ItemDatabase (SO)
        ▲                       │                                       ▲
        │                       ▼                                       │
   QuestSystem <──── EnemyController / LootSystem ──────────────────────┘
        │
        ▼
  RewardService ──> (EXP, oro, items, mascotas, monturas, atributos…)
        │
SaveSystem (ISaveable en cada sistema; SaveManager orquesta)
```

- El combate reporta muertes → `QuestSystem` (objetivos kill) y `LootSystem`.
- `RewardService` es el único punto que entrega recompensas (misiones, nivel,
  cofres), para que cualquier fuente pueda dar cualquier tipo de recompensa.
- `EquipmentManager` recalcula stats derivados y notifica a `CharacterStats`;
  nadie más suma bonos por su cuenta.

---

## 2. Árbol de carpetas propuesto

Compatible con el prototipo actual (se crean carpetas al migrar cada sistema,
no todas de golpe):

```
Assets/
├── Game/
│   ├── Scripts/
│   │   ├── Core/            # Bootstrap, GameContext (service locator acotado), eventos globales
│   │   ├── Characters/      # Player, clases de personaje, avatar
│   │   ├── Combat/          # DamageCalculator, hitboxes, interfaces de combate
│   │   ├── Stats/           # StatType, StatSheet, modificadores
│   │   ├── Items/           # Definiciones, instancias, rareza, mejora
│   │   ├── Inventory/       # InventoryManager, stacks, filtros
│   │   ├── Equipment/       # Slots, requisitos, cálculo de bonos
│   │   ├── Quests/          # Definiciones, runtime, objetivos, tracker
│   │   ├── Enemies/         # EnemyDefinition, IA, spawner, escalado
│   │   ├── Pets/            # PetDefinition, PetController, bonos pasivos
│   │   ├── Mounts/          # MountDefinition, MountController
│   │   ├── Progression/     # ExperienceSystem, LevelProgressionTable, RewardService
│   │   ├── Saving/          # ISaveStorage, JsonFileStorage, SaveManager, DTOs
│   │   ├── Networking/      # Cliente WS existente + capa de intenciones
│   │   ├── UI/              # Controladores de UI (solo presentación)
│   │   └── Utilities/
│   ├── ScriptableObjects/   # Assets .asset organizados igual que Scripts
│   │   ├── Items/  ├── Equipment/  ├── Quests/  ├── Enemies/
│   │   ├── Levels/ ├── Rewards/    ├── Rarities/ └── Upgrade/
│   ├── Editor/              # Herramientas de generación (ver §10)
│   ├── Prefabs/  ├── Scenes/  ├── Materials/  ├── Models/
│   ├── Animations/  ├── Audio/  └── UI/
Server/                      # Servidor WebSocket Node.js existente
docs/                        # roadmap, decisiones, balance
```

Namespaces espejo: `Game.Core`, `Game.Items`, `Game.Quests`, etc. Cada carpeta
de Scripts tiene su **Assembly Definition** (`.asmdef`) para compilar rápido y
hacer cumplir la dirección de dependencias (UI → lógica → datos, nunca al revés).

---

## 3. Sistema de niveles 1–105

### Datos

```csharp
// ScriptableObject: una fila por nivel, 1..105, sin saltos.
[CreateAssetMenu(menuName = "Game/Progression/Level Table")]
public class LevelProgressionTable : ScriptableObject
{
    public int MaxLevel = 105;
    public LevelRow[] Rows;          // Rows[i] = nivel i+1
}

[Serializable]
public struct LevelRow
{
    public int Level;
    public long ExpToNext;           // EXP para pasar al siguiente nivel
    public StatBlock StatGrowth;     // crecimiento base al subir
    public int AttributePoints;      // puntos libres otorgados
    public RewardBundle LevelUpReward; // opcional (ver §9)
}
```

La tabla **no se rellena a mano**: la genera la herramienta de editor (§10) a
partir de una `ExpCurveConfig` (SO con parámetros: exp base, exponente,
multiplicadores por tramo). Cambiar la curva = regenerar la tabla, sin tocar código.

### Lógica

```csharp
public class ExperienceSystem
{
    public event Action<int> LevelChanged;
    public event Action<long, long> ExperienceChanged; // (actual, requerida)

    public void AddExperience(long amount);  // multi-level-up en un solo AddExperience
    // Clampa en MaxLevel (105): al llegar, la EXP sobrante se descarta
    // y ExperienceChanged reporta la barra llena.
}
```

- Detecta subidas múltiples en bucle (mucha EXP de golpe = varios niveles).
- Al subir: aplica `StatGrowth` de la clase (§4), entrega `AttributePoints`,
  dispara `LevelChanged`, y pasa `LevelUpReward` a `RewardService`.
- La UI escucha los eventos; no consulta.

### Stats de personaje

`StatType` (enum): `Health, Mana, PhysicalAttack, MagicalAttack, Defense,
MagicDefense, AttackSpeed, MoveSpeed, CritChance, CritDamage, Accuracy, Evasion`.

`StatSheet` mantiene por stat: base (nivel+clase) + modificadores (equipo,
mascotas, monturas, buffs) → valor final cacheado. Modificadores planos y
porcentuales, con origen identificado para poder retirarlos limpiamente.

---

## 4. Clases de personaje

```csharp
[CreateAssetMenu(menuName = "Game/Characters/Class Definition")]
public class CharacterClassDefinition : ScriptableObject
{
    public string ClassId;                 // "warrior", "ninja", "shaman", "umbra"
    public string DisplayNameKey;          // clave i18n, ej. "class.warrior.name"
    public StatBlock BaseStats;
    public StatBlock GrowthPerLevel;       // crecimiento distinto por clase
    public WeaponCategory[] AllowedWeapons;
    public ArmorType[] AllowedArmor;
    public ResourceType Resource;          // Mana | Rage | Energy
    public SkillDefinition[] Skills;       // se amplía después; la lista ya existe
}
```

Las 4 clases del prototipo (Guerrero, Ninja, Chamán, Umbra) se convierten en
assets de este SO; agregar Arquero/Sacerdote después es crear un asset, no código.

---

## 5. Items y equipamiento

### Jerarquía de definiciones (ScriptableObjects)

```
ItemDefinition (abstract)
├── EquipmentDefinition (abstract)   // nivel req., clase permitida, rareza, mejora
│   ├── WeaponDefinition             // dañoMin/Max, velocidad, alcance, DamageType, categoría
│   ├── ArmorDefinition              // slot, defensa, defMágica, vida/maná extra
│   └── AccessoryDefinition          // slot, bonos secundarios
├── ConsumableDefinition
├── MaterialDefinition
├── QuestItemDefinition
├── CosmeticDefinition               // slot cosmético, prefab visual
├── PetItemDefinition / MountItemDefinition  // el item que otorga la mascota/montura
└── ChestDefinition                  // tabla de contenido
```

Campos comunes de `ItemDefinition`: `ItemId` (string único), `NameKey`,
`DescriptionKey`, `Icon`, `MaxStack`, `BuyPrice`, `SellPrice`, `Tradeable`,
`Rarity`, `Category`.

Campos de `EquipmentDefinition`: `RequiredLevel`, `AllowedClasses`,
`Upgradeable`, `MaxUpgradeLevel` (limitado además por rareza), `VisualPrefab`,
`SetId` (conjunto visual), bonos secundarios (`StatModifier[]`), durabilidad opcional.

### Instancias (runtime + guardado)

```csharp
[Serializable]
public class ItemInstance
{
    public string InstanceId;   // GUID — clave anti-duplicación de cara al servidor
    public string ItemId;       // referencia a la definición vía ItemDatabase
    public int Quantity;
    public int UpgradeLevel;    // +0..+15
    public bool Locked;
    public List<RolledStat> BonusStats;  // bonos aleatorios rodados al drop
    public int Durability;      // -1 si no aplica
}
```

`ItemDatabase` (SO singleton de datos): registro `ItemId → ItemDefinition`,
validado en editor (IDs duplicados = error de importación, no bug en runtime).

### Slots de equipamiento

Enum `EquipSlot`: `Helmet, Chest, Gloves, Pants, Boots, Cape, Weapon,
Necklace, RingLeft, RingRight, Bracelet, Belt, Talisman, Earrings` +
cosméticos: `CostumeFull, CostumeHead, CostumeBody, WeaponSkin, MountSkin, PetSkin`.

`EquipmentManager.TryEquip(ItemInstance)` valida en orden: nivel requerido →
clase permitida → item bloqueado → requisito especial → slot compatible.
Devuelve `EquipResult` (enum con la razón del fallo, mapeada a clave i18n, ej.
`equip.fail.level_too_low`). El equipamiento **estadístico** y el **cosmético**
son diccionarios separados; el cosmético solo alimenta al sistema de avatar y
tiene toggles de visibilidad por parte.

### Rarezas

```csharp
[CreateAssetMenu(menuName = "Game/Items/Rarity Config")]
public class RarityConfig : ScriptableObject  // uno por rareza, agrupados en RarityTable
{
    public Rarity Tier;              // Common..Mythic
    public Color UiColor;            // NUNCA hardcodear color en lógica/UI
    public float BasePowerMultiplier;
    public Vector2Int SecondaryStatCount;   // min..max de bonos rodados
    public int MaxUpgradeLevel;
    public float EconomicValueMultiplier;
    public float DropWeight;
    public GameObject VisualEffectPrefab;   // opcional
}
```

### Sistema de mejora (+0 → +15)

```csharp
[CreateAssetMenu(menuName = "Game/Items/Upgrade Config")]
public class UpgradeConfig : ScriptableObject
{
    public UpgradeStep[] Steps;   // 15 pasos, generados/editables en tabla
}

[Serializable]
public struct UpgradeStep
{
    public int TargetLevel;              // +1..+15
    public float SuccessChance;          // 0..1
    public FailurePolicy OnFailure;      // KeepLevel | Downgrade | Destroy (configurable por paso)
    public long GoldCost;
    public MaterialRequirement[] Materials;
    public string ProtectionMaterialId;  // material que anula Destroy/Downgrade
    public float StatMultiplierPerLevel; // aporte del paso al poder del item
}
```

`UpgradeService.TryUpgrade(ItemInstance, useProtection)` → `UpgradeResult`
(Success / FailKept / FailDowngraded / Destroyed / NotEnoughGold / …).
El roll y el resultado se calculan en un método puro sin dependencias de Unity
(`UpgradeResolver.Resolve(step, roll, protection)`) para poder testearlo y,
más adelante, ejecutarlo en el servidor. VFX por nivel de mejora = presentación,
escucha el evento `ItemUpgraded`.

### Inventario

`InventoryManager`: lista de `ItemInstance` con capacidad configurable.
Operaciones: add (con auto-stack), remove, move, split, use, sort, filter por
`ItemCategory`, lock/unlock, `IsFull`, comparación contra equipado (la
comparación la calcula lógica, la pinta UI). Evento único
`InventoryChanged(SlotChange[])` para que la UI redibuje solo lo afectado.

---

## 6. Combate

- **`DamageCalculator` estático y puro**: entrada = stats del atacante, stats
  del defensor, datos del arma/skill; salida = `DamageResult { Amount, IsCrit,
  IsMiss, DamageType }`. Sin acceso a GameObjects: 100 % testeable y portable
  al servidor.
- Interfaces: `IDamageable` (recibir daño, morir), `IAttackable` (puede ser
  objetivo), `IInteractable` (NPCs, cofres), `ILootSource` (qué suelta al morir).
- Flujo: input → intención de ataque → validación (alcance, cooldown) →
  `DamageCalculator` → aplicar a `IDamageable` → eventos (`DamageDealt`,
  `EntityDied`) → animación/VFX/números flotantes reaccionan al evento.
- Muerte del jugador → `RespawnService` (punto de reaparición de la zona).
- Muerte de enemigo → EXP al atacante + `LootSystem` (tabla de botín) +
  notificación a `QuestSystem`.

---

## 7. Enemigos

```csharp
[CreateAssetMenu(menuName = "Game/Enemies/Enemy Definition")]
public class EnemyDefinition : ScriptableObject
{
    public string EnemyId; public string NameKey;
    public int Level; public EnemyTier Tier;   // Normal|Elite|MiniBoss|Boss|WorldBoss
    public StatBlock Stats;
    public long ExpReward; public Vector2Int GoldReward;
    public LootTable Loot;                     // SO reutilizable entre enemigos
    public float DetectionRadius; public float ChaseDistance;
    public EnemyBehaviorProfile Behavior;      // agresivo/pasivo, leash, etc.
    public GameObject Prefab;
}
```

El escalado 1–105 lo produce la herramienta de editor (§10) con curvas por
tier, para que un Normal nivel 40 y un Elite nivel 40 guarden proporción
coherente con el poder esperado del jugador (misma tabla de referencia que
items). IA por estados (Idle → Aggro → Chase → Attack → Leash) como en el
prototipo, extraída a `EnemyController` + `EnemyBehaviorProfile`.

---

## 8. Misiones

### Datos

```csharp
[CreateAssetMenu(menuName = "Game/Quests/Quest Definition")]
public class QuestDefinition : ScriptableObject
{
    public string QuestId; public QuestKind Kind;   // Main|Side|Daily|Weekly|Repeatable|Event|Class
    public string TitleKey, DescriptionKey;
    public string StartDialogKey, ProgressDialogKey, CompleteDialogKey;
    public string GiverNpcId, ReceiverNpcId;
    public int MinLevel; public int MaxLevel;        // 0 = sin máximo
    public string[] PrerequisiteQuestIds;
    public QuestObjective[] Objectives;
    public RewardBundle Rewards;
    public string[] NextQuestIds;
    public bool Repeatable; public float ResetHours;
}
```

`QuestObjective` es una clase base serializable (con `[SerializeReference]`)
con subtipos: `TalkToNpcObjective`, `KillObjective`, `CollectObjective`,
`DeliverObjective`, `ExploreObjective`, `ReachPointObjective`,
`DefeatBossObjective`, `ProtectNpcObjective`, `EscortObjective`,
`ActivateObjective`, `UseItemObjective`, `EquipItemObjective`,
`UpgradeItemObjective`, `ReachLevelObjective`, `CompleteDungeonObjective`.
Agregar un tipo nuevo = una clase nueva, sin tocar el sistema.

### Runtime

`QuestState` (enum): `Locked, Available, Active, ObjectivesCompleted,
Completed, Failed, Abandoned`.

`QuestLog` guarda `QuestProgress { QuestId, State, ObjectiveCounters[] }`.
Los objetivos **se suscriben a eventos** de los demás sistemas
(`EntityDied`, `ItemAcquired`, `ItemUpgraded`, `LevelChanged`,
`ZoneEntered`…) — el sistema de misiones nunca hace polling.
Al completar: `RewardService.Grant(quest.Rewards)` y desbloqueo de `NextQuestIds`.

### Zonas y campaña

Progresión por zonas de 10 niveles (Zona 1: 1–10 … Zona final: 101–105),
definida en `ZoneDefinition` (SO): rango de nivel, ciudad/campamento, NPCs
(misiones, mercader, herrero, almacén), áreas de enemigos normales y élite,
jefe de zona, mazmorra opcional, materiales propios. **Solo se construye la
Zona 1 al inicio**; el resto son assets vacíos por crear con los mismos moldes.
La cadena inicial (niveles 1–10, historia 100 % original) sigue la secuencia
despertar → comandante → primeras criaturas → provisiones → herrero → primera
arma → equipar armadura → zona corrompida → élite → jefe → acceso a la región
siguiente; cada misión enseña una mecánica (movimiento, combate, loot,
inventario, equipar, mejora, élite, jefe).

---

## 9. Recompensas

```csharp
[Serializable]
public class RewardBundle
{
    public long Experience; public long Gold;
    public ItemReward[] Items;          // ItemId + cantidad (+ rareza forzada opcional)
    public int AttributePoints; public int SkillPoints;
    public string[] UnlockZoneIds;
    public string[] PetIds; public string[] MountIds; public string[] CosmeticIds;
}
```

`RewardService.Grant(RewardBundle, source)` es el **único** camino de entrega
(misiones, level-up, cofres, eventos). Maneja inventario lleno (según
configuración: correo/buzón futuro, o bloqueo de la entrega con clave i18n
`reward.fail.inventory_full`).

---

## 10. Mascotas y monturas

### Mascotas

`PetDefinition` (SO): `PetId`, `NameKey`, tipo (`Support | Collector |
Offensive | Defensive | Experience`), rareza, prefab, bonos pasivos
(`StatModifier[]` + bonos especiales como `ExpBonus`, `GoldBonus`,
`AutoLootRadius`), tabla de nivel propia, `EvolutionTarget` (otro
`PetDefinition`) y requisitos de evolución.

`PetService`: invocar/guardar (una activa; el límite es dato, no hardcode),
seguir al jugador (`PetController` con follow simple), aplicar/retirar bonos
pasivos vía `StatSheet`, EXP propia, participación opcional en combate y
recogida opcional según flags del tipo.

### Monturas

`MountDefinition` (SO): `MountId`, `NameKey`, categoría (`Horse | Wolf |
Tiger | MagicCreature | GroundDragon | Flying`), `RequiredLevel`, rareza,
`SpeedMultiplier`, bonos opcionales, prefab, animaciones, apariencias,
evolución. `MountService`: summon/mount/dismount, aplica `MoveSpeed` como
modificador con origen, restricciones por zona (`ZoneDefinition.MountRules`).
La categoría `Flying` existe desde el día 1 en el enum y en los datos, pero
`MountController` solo implementa locomoción terrestre; el controlador de vuelo
es una estrategia (`IMountLocomotion`) que se agrega después sin tocar lo demás.

---

## 11. Guardado y carga

- `ISaveStorage { Task Save(string slot, string json); Task<string> Load(string slot); }`
  - Implementación inicial: `JsonFileStorage` (archivo en `persistentDataPath`,
    escritura atómica: tmp + rename, con backup del último guardado válido).
  - Futuro: `RemoteStorage` contra el servidor, sin tocar los sistemas.
- Cada sistema implementa `ISaveable { string SaveKey; JToken Capture(); void Restore(JToken); }`
  (DTOs serializables propios, versionados con `SchemaVersion` para migraciones).
- `SaveManager` orquesta: personaje (nombre, clase, sexo), nivel, EXP, stats y
  puntos, inventario, equipamiento (estadístico y cosmético), misiones,
  mascota activa + niveles de mascotas, montura seleccionada, posición, settings.
- **PlayerPrefs queda solo para settings de dispositivo** (volumen, calidad).

---

## 12. UI

Controladores por ventana (`HudController`, `InventoryWindow`,
`EquipmentWindow`, `StatsWindow`, `QuestLogWindow`, `QuestTrackerWidget`,
`TargetFrame`, `NpcDialogWindow`, `RewardPopup`, `PetWindow`, `MountWindow`,
`UpgradeWindow`, `ItemTooltip`). Todos:

- Se suscriben a eventos en `OnEnable`, se desuscriben en `OnDisable`.
- No contienen reglas de juego (la comparación de items, el resultado de
  mejora, etc. vienen calculados de la capa de lógica).
- Textos por clave i18n con tabla `es` como idioma base.

---

## 13. Preparación multijugador

El prototipo ya tiene servidor WS local. La arquitectura lo respeta y prepara
la migración de autoridad:

1. **Hoy:** lógica corre en cliente; el servidor sincroniza presencia, chat y
   posición (estado actual del prototipo).
2. **Regla desde ya:** las mutaciones pasan por servicios con métodos únicos
   (`TryUpgrade`, `TryEquip`, `AddExperience`) y las resoluciones críticas
   (`DamageCalculator`, `UpgradeResolver`, curva de EXP) son **funciones puras
   sin dependencias de Unity** → portables a Node/servidor tal cual como
   especificación.
3. **Pendiente inmediato de red:** sincronizar sexo/identidad completa de
   jugadores remotos (hoy remotos usan clase + masculino por defecto).
4. **Futuro:** el servidor valida intenciones y emite resultados; los
   servicios locales pasan a ser proxies. `InstanceId` (GUID) por item desde
   el día 1 es la base anti-duplicación.

---

## 14. Herramienta de editor: generador de variantes por nivel

**Nadie crea 105 items a mano.** Ventana de editor (`Game/Editor/`):

`ItemVariantGeneratorWindow` (EditorWindow) que recibe:

- Un `ItemArchetype` (SO plantilla): categoría (ej. espada, casco), stats base
  en nivel 1, curva de crecimiento (AnimationCurve o exponente), slots de
  conjunto visual por rango (1–10, 11–20, …, 101–105, configurable), reglas de
  nombre (`"item.sword.t{tier}.name"`).
- Rango de niveles y paso (ej. un item cada nivel, o cada 2).

Y produce/actualiza en batch los assets `WeaponDefinition`/`ArmorDefinition`
correspondientes, con IDs deterministas (`sword_t3_lv25`) para que regenerar
**actualice** en lugar de duplicar. La misma herramienta genera
`LevelProgressionTable` desde `ExpCurveConfig` y el escalado de
`EnemyDefinition` por tier. Incluye un panel de validación: IDs duplicados,
huecos en la secuencia de niveles, items sin icono/prefab.

---

## 15. Riesgos técnicos

1. **Migrar el bootstrap monolítico sin romper el prototipo.** Mitigación:
   extraer un sistema por etapa, manteniendo `PrototypeBootstrap` como
   compositor que instancia los nuevos servicios; validar en Play tras cada etapa.
2. **El arte es el cuello de botella real, no el código.** Placeholders
   (KayKit CC0, procedural) hasta que el loop se sienta bien. Solo assets
   CC0/MIT/propios, documentados en `ASSET_LICENSES.md`.
3. **Duplicación de items** al mover/dividir/guardar. Mitigación: operaciones
   de inventario atómicas en un solo punto, `InstanceId` GUID, tests de las
   operaciones puras.
4. **Save corrupto en mobile** (app matada durante escritura). Mitigación:
   escritura atómica + backup + versionado de esquema.
5. **`[SerializeReference]` en objetivos de misión** es potente pero frágil
   ante renombres de clase. Mitigación: nombres estables + `FormerlySerializedAs`
   / migradores.
6. **Alcance MMO.** El objetivo realista es un ARPG online de escala pequeña.
   Los sistemas se diseñan para cliente-autoridad-migrable, no para 10k CCU.
7. **Rendimiento Android:** presupuesto 60 FPS ya establecido en Fase 5;
   cada sistema nuevo debe respetar cero-polling en UI y pooling de VFX/enemigos.

---

## 16. Hoja de ruta de implementación

Cada etapa termina compilando y jugable en la escena de prueba. No se avanza
si la anterior no está funcional.

| Etapa | Contenido | Resultado verificable |
|---|---|---|
| **A. Datos base** | Enums, `StatBlock`, `StatSheet`, `RarityConfig`, `ItemDefinition` + jerarquía, `ItemDatabase`, `LevelProgressionTable` + `ExpCurveConfig` | SOs de ejemplo creados; validador de IDs pasa |
| **B. Progresión** | `ExperienceSystem` conectado a la EXP existente del prototipo, cap 105, multi-level-up, puntos de atributo | Matar enemigos sube nivel según tabla; HUD reacciona por eventos |
| **C. Inventario + equipo** | `ItemInstance`, `InventoryManager`, `EquipmentManager`, migración del inventario actual | 1 espada, 1 casco, 1 pechera, 1 accesorio equipables con requisitos |
| **D. Combate refactor** | `DamageCalculator` puro, interfaces, loot por `LootTable` | Daño idéntico o mejor que el actual; crit/miss visibles |
| **E. Mejora +0..+15** | `UpgradeConfig`, `UpgradeResolver` puro, `UpgradeService`, migrar la mejora existente | Mejorar espada con éxito/fallo según tabla configurable |
| **F. Misiones** | `QuestDefinition`, objetivos Talk/Kill/Collect, `QuestLog`, `RewardService` | Las 3 misiones (hablar, matar, recolectar) completables con recompensas |
| **G. Guardado** | `ISaveStorage`, `JsonFileStorage`, `SaveManager`, `ISaveable` en B–F | Cerrar y abrir conserva todo (objetivo inmediato del prototipo) |
| **H. Mascota + montura** | `PetDefinition`/`MountDefinition` + servicios, 1 de cada | Mascota sigue y da bono; montura acelera |
| **I. Herramienta editor** | `ItemVariantGeneratorWindow` + generadores de tablas | Generar set de espadas 1–105 en un clic |
| **J. Zona 1** | `ZoneDefinition`, cadena de misiones 1–10, NPCs, jefe | Campaña 1–10 jugable de punta a punta |
| **K. Red** | Sincronizar identidad completa (sexo incluido); intenciones para acciones críticas | Remotos se ven correctos; base para autoridad de servidor |

### Primera tarea concreta recomendada

**Etapa A + B**: crear los enums y contenedores de stats, la
`LevelProgressionTable` generada desde `ExpCurveConfig`, y conectar
`ExperienceSystem` al flujo de EXP ya existente del prototipo — porque todo lo
demás (items, enemigos, misiones, recompensas) referencia stats y niveles.
En paralelo natural con la Etapa G reducida (guardar nombre/clase/sexo/nivel/
oro/inventario en JSON local), que es el siguiente objetivo ya identificado
del prototipo.

---

## 17. Convenciones de código

- C# con namespaces `Game.*`; clases/métodos/variables en inglés.
- Textos de jugador: claves i18n (tabla `es` primero).
- Propiedades y encapsulación; validación de nulls en fronteras (inspector,
  carga de datos, red).
- Prohibido en lógica principal: `GameObject.Find`, `FindObjectOfType`
  repetitivo, singletons más allá de `GameContext`, valores mágicos, colores
  hardcodeados.
- Lógica de reglas en clases puras testeables; MonoBehaviours delgados.
- Un sistema por PR/commit; mensajes de commit en imperativo, en inglés.
