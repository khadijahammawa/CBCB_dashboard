import type { ManualPatientInput } from "../types.ts";

export type DemoPatientKey = "lowBurden" | "moderateBurden" | "highBurden";

export const demoPatients: Record<DemoPatientKey, ManualPatientInput> = {
  lowBurden: {
    subid: "DEMO_LOW_001",
    age: 48,
    sex: "F",
    bmi: 22.4,
    bsa: 1.72,
    max_contraction_velocity: 88,
    max_expansion_velocity: 102,
    per_ml_per_s: 1.72,
    fractional_wall_thickening: 52,
    ef_pct: 72,
    eat_volume: 65,
    lvmi_g_per_m2: 75,
    delta_suv_heart: 1.65
  },
  moderateBurden: {
    subid: "DEMO_MOD_001",
    age: 61,
    sex: "M",
    bmi: 27.6,
    bsa: 1.94,
    max_contraction_velocity: 72,
    max_expansion_velocity: 82,
    per_ml_per_s: 1.34,
    fractional_wall_thickening: 40,
    ef_pct: 60,
    eat_volume: 105,
    lvmi_g_per_m2: 95,
    delta_suv_heart: 1.1
  },
  highBurden: {
    subid: "DEMO_HIGH_001",
    age: 69,
    sex: "F",
    bmi: 31.8,
    bsa: 1.86,
    max_contraction_velocity: 60,
    max_expansion_velocity: 66,
    per_ml_per_s: 1.03,
    fractional_wall_thickening: 31,
    ef_pct: 50,
    eat_volume: 130,
    lvmi_g_per_m2: 112,
    delta_suv_heart: 0.82
  }
};

export const demoPatientOrder: DemoPatientKey[] = [
  "lowBurden",
  "moderateBurden",
  "highBurden"
];
