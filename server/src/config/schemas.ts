import { z } from "zod";

/**
 * Formas de server/config/*.json, validadas al arrancar.
 * Los INVARIANTES de diseño documentados en docs/balance.md y docs/excellent.md
 * se verifican aquí: si un JSON los viola, el servidor NO arranca.
 */

const probability = z.number().min(0).max(1);

const upgradeLevelSchema = z.object({
  level: z.number().int().min(1).max(15),
  success: probability,
  onFail: z.enum(["none", "downgrade", "destroy"]),
  jewels: z.number().int().positive(),
});

const protectionSchema = z
  .object({
    nameKey: z.string().min(1),
    effect: z.enum(["destroy_becomes_downgrade", "failure_becomes_stay"]),
    minLevel: z.number().int().min(1).max(15),
    maxLevel: z.number().int().min(1).max(15),
    consumedOnAttempt: z.boolean(),
  })
  .refine((p) => p.minLevel <= p.maxLevel, {
    message: "minLevel no puede superar maxLevel",
  });

export const upgradeConfigSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string(),
    levels: z.array(upgradeLevelSchema).length(15),
    protections: z.object({
      iron_anchor: protectionSchema,
      preservation_seal: protectionSchema,
    }),
    pity: z.object({
      enabled: z.boolean(),
      bonusPerConsecutiveFail: probability,
      maxBonus: probability,
      resetOnSuccess: z.boolean(),
      scope: z.literal("per_item_instance"),
      visibleToPlayer: z.boolean(),
    }),
    limits: z.object({
      maxAttemptsPerMinutePerAccount: z.number().int().positive(),
      auditLog: z.boolean(),
    }),
  })
  .superRefine((cfg, ctx) => {
    cfg.levels.forEach((lvl, i) => {
      if (lvl.level !== i + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["levels", i, "level"],
          message: `levels debe ser contiguo 1..15: en el índice ${i} se esperaba ${i + 1}, hay ${lvl.level}`,
        });
      }
    });
    // INVARIANTE (docs/balance.md §2): el Sello de Preservación tiene tope en +12.
    // Sin tope, la simulación muestra 0 riesgo y el loop central colapsa.
    if (cfg.protections.preservation_seal.maxLevel > 12) {
      ctx.addIssue({
        code: "custom",
        path: ["protections", "preservation_seal", "maxLevel"],
        message:
          "INVARIANTE VIOLADO: preservation_seal.maxLevel > 12. Ver docs/balance.md sección 2 antes de tocar esto.",
      });
    }
  });

export type UpgradeConfig = z.infer<typeof upgradeConfigSchema>;

const excellentOptionSchema = z.object({
  id: z.number().int().min(1).max(6),
  nameKey: z.string().min(1),
  effect: z.string().min(1),
  value: z.number(),
});

const poolSchema = z
  .array(excellentOptionSchema)
  .length(6)
  .refine((pool) => new Set(pool.map((o) => o.id)).size === 6, {
    message: "los ids del pool deben ser únicos (1..6)",
  });

export const excellentConfigSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string(),
    dropChain: z.object({
      equipmentDropChance: probability,
      excellentChance: probability,
    }),
    optionCountDistribution: z.record(z.enum(["1", "2", "3", "4", "5", "6"]), probability),
    pools: z.object({
      weapon: poolSchema,
      armor: poolSchema,
      shield: poolSchema,
    }),
    setBonuses: z.array(
      z.object({
        pieces: z.number().int().min(2).max(7),
        nameKey: z.string().min(1),
        effect: z.string().min(1),
        value: z.number(),
      }),
    ),
    reroll: z.object({
      itemId: z.string().min(1),
      nameKey: z.string().min(1),
      mode: z.literal("single_option"),
      playerChoosesWhichOption: z.boolean(),
      // INVARIANTE (docs/excellent.md §6): el reroll JAMÁS cambia la cantidad de
      // opciones. Vender cantidad destruye la rareza sobre la que vive el sistema.
      canChangeOptionCount: z.literal(false, {
        error:
          "INVARIANTE VIOLADO: reroll.canChangeOptionCount debe ser false. Ver docs/excellent.md sección 6.",
      }),
    }),
    presentation: z.object({
      nameColorByOptionCount: z.record(
        z.enum(["1", "2", "3", "4", "5", "6"]),
        z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      ),
      groundParticlesFromOptionCount: z.number().int().min(1).max(6),
      globalAnnounceFromOptionCount: z.number().int().min(1).max(6),
    }),
    invariants: z.object({
      maxPowerContributionAt6Options: probability,
    }),
    limits: z.object({
      auditLogFromOptionCount: z.number().int().min(1).max(6),
    }),
  })
  .superRefine((cfg, ctx) => {
    const entries = Object.entries(cfg.optionCountDistribution);
    if (entries.length !== 6) {
      ctx.addIssue({
        code: "custom",
        path: ["optionCountDistribution"],
        message: "deben existir las 6 claves de cantidad de opciones (1..6)",
      });
      return;
    }
    const sum = entries.reduce((acc, [, p]) => acc + p, 0);
    if (Math.abs(sum - 1) > 1e-9) {
      ctx.addIssue({
        code: "custom",
        path: ["optionCountDistribution"],
        message: `la distribución debe sumar 1.0 exacto; suma ${sum}`,
      });
    }
  });

export type ExcellentConfig = z.infer<typeof excellentConfigSchema>;

export const worldConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string(),
  movement: z.object({
    speedUnitsPerSecond: z.number().positive(),
    mapHalfExtent: z.number().positive(),
  }),
  net: z.object({
    simulationTickHz: z.number().int().min(1).max(60),
    snapshotHz: z.number().int().min(1).max(60),
  }),
});

export type WorldConfig = z.infer<typeof worldConfigSchema>;
