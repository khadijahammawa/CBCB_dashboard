import type { ReferenceStats } from "../types.ts";

const syntheticCompositeDistribution = [
  -1.8, -1.55, -1.35, -1.2, -1.05, -0.9, -0.75, -0.6, -0.45,
  -0.3, -0.15, 0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84,
  0.96, 1.08, 1.2, 1.35, 1.5, 1.7, 1.9, 2.15
];

const syntheticKineticDistribution = [
  -2.1, -1.8, -1.55, -1.3, -1.05, -0.85, -0.65, -0.45, -0.25,
  -0.1, 0.05, 0.2, 0.35, 0.5, 0.65, 0.82, 1.0, 1.18, 1.38,
  1.58, 1.82, 2.05, 2.35
];

const syntheticRemodellingDistribution = [
  -1.75, -1.45, -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.15,
  0.3, 0.45, 0.62, 0.78, 0.95, 1.12, 1.32, 1.55, 1.85, 2.2
];

const syntheticMetabolicDistribution = [
  -1.9, -1.6, -1.35, -1.1, -0.85, -0.65, -0.42, -0.2, 0, 0.18,
  0.36, 0.55, 0.75, 0.98, 1.22, 1.48, 1.78, 2.1
];

export const referenceStats: ReferenceStats = {
  features: {
    max_contraction_velocity: {
      mean: 75,
      sd: 12,
      label: "Max contraction velocity",
      unit: "mm/s",
      direction: -1
    },
    max_expansion_velocity: {
      mean: 85,
      sd: 15,
      label: "Max expansion velocity",
      unit: "mm/s",
      direction: -1
    },
    per_ml_per_s: {
      mean: 1.4,
      sd: 0.25,
      label: "PER",
      unit: "mL/s",
      direction: -1
    },
    fractional_wall_thickening: {
      mean: 42,
      sd: 8,
      label: "Fractional wall thickening",
      unit: "%",
      direction: -1
    },
    ef_pct: {
      mean: 62,
      sd: 7,
      label: "Ejection fraction",
      unit: "%",
      direction: -1
    },
    eat_volume: {
      mean: 95,
      sd: 25,
      label: "EAT volume",
      unit: "mL",
      direction: 1
    },
    lvmi_g_per_m2: {
      mean: 90,
      sd: 15,
      label: "LV mass index",
      unit: "g/m2",
      direction: 1
    },
    delta_suv_heart: {
      mean: 1.2,
      sd: 0.3,
      label: "Delta SUV heart",
      unit: "SUV",
      direction: -1
    }
  },
  compositeDistribution: syntheticCompositeDistribution,
  domainDistributions: {
    cardiac_kinetic_impairment_score: syntheticKineticDistribution,
    cardiac_remodelling_adiposity_score: syntheticRemodellingDistribution,
    myocardial_metabolic_impairment_score: syntheticMetabolicDistribution,
    cardiac_composite_burden_score: syntheticCompositeDistribution
  }
};
