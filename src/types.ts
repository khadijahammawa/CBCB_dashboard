export interface PatientInput {
  subid?: string;
  age?: number;
  sex?: string;
  bmi?: number;
  bsa?: number;
  brain_phenotype?: string;
  brain_binary?: number;
  vermis_feature?: number;
  stg_feature?: number;
  delta_suv_heart?: number;
  eat_volume?: number;
  lvmi_g_per_m2?: number;
  max_contraction_velocity?: number;
  max_expansion_velocity?: number;
  per_ml_per_s?: number;
  fractional_wall_thickening?: number;
  ef_pct?: number;
}

export const brainContextKeys = [
  "brain_phenotype",
  "brain_binary",
  "vermis_feature",
  "stg_feature"
] as const;

export type BrainContextKey = (typeof brainContextKeys)[number];

export type ManualPatientInput = Omit<PatientInput, BrainContextKey>;

export const scoredFeatureKeys = [
  "max_contraction_velocity",
  "max_expansion_velocity",
  "per_ml_per_s",
  "fractional_wall_thickening",
  "ef_pct",
  "eat_volume",
  "lvmi_g_per_m2",
  "delta_suv_heart"
] as const;

export type ScoredFeatureKey = (typeof scoredFeatureKeys)[number];

export const domainScoreKeys = [
  "cardiac_kinetic_impairment_score",
  "cardiac_remodelling_adiposity_score",
  "myocardial_metabolic_impairment_score"
] as const;

export type DomainScoreKey = (typeof domainScoreKeys)[number];

export type CompositeScoreKey = "cardiac_composite_burden_score";

export type DistributionKey = DomainScoreKey | CompositeScoreKey;

export type BurdenDirection = -1 | 1;

export interface FeatureReferenceStats {
  mean: number;
  sd: number;
  label: string;
  unit: string;
  direction: BurdenDirection;
}

export interface ReferenceStats {
  features: Record<ScoredFeatureKey, FeatureReferenceStats>;
  compositeDistribution: number[];
  domainDistributions: Record<DistributionKey, number[]>;
}

export interface PatientMetadata {
  subid?: string;
  age?: number;
  sex?: string;
  bmi?: number;
  bsa?: number;
}

export interface FeatureDirectionalScore {
  feature: ScoredFeatureKey;
  label: string;
  unit: string;
  value: number;
  referenceMean: number;
  referenceSd: number;
  direction: BurdenDirection;
  zScore: number;
  directionalZScore: number;
}

export type FeatureDirectionalScores = Record<
  ScoredFeatureKey,
  FeatureDirectionalScore | null
>;

export interface DomainAvailability {
  label: string;
  isAvailable: boolean;
  availableFeatureCount: number;
  requiredFeatureCount: number;
  availableFeatures: ScoredFeatureKey[];
  missingFeatures: ScoredFeatureKey[];
  reason: string | null;
}

export interface FeatureContribution {
  feature: ScoredFeatureKey;
  label: string;
  unit: string;
  value: number;
  directionalZScore: number;
}

export type RiskLabel =
  | "Low relative burden"
  | "Moderate relative burden"
  | "High relative burden"
  | "Very high relative burden";

export type ScoringRiskLabel = RiskLabel | "Insufficient data";

export interface ScoringResult {
  patientMetadata: PatientMetadata;
  featureDirectionalZScores: FeatureDirectionalScores;
  domainScores: Record<DomainScoreKey, number | null>;
  domainPercentiles: Record<DomainScoreKey, number | null>;
  domainAvailability: Record<DomainScoreKey, DomainAvailability>;
  compositeScore: number | null;
  compositePercentile: number | null;
  riskLabel: ScoringRiskLabel;
  top3PositiveContributors: FeatureContribution[];
  missingRequiredFields: ScoredFeatureKey[];
  dataCompletenessPercentage: number;
  interpretationText: string;
  methodNote: string;
}
