import { referenceStats as defaultReferenceStats } from "../data/referenceStats.ts";
import {
  domainScoreKeys,
  scoredFeatureKeys,
  type DomainAvailability,
  type DomainScoreKey,
  type FeatureContribution,
  type FeatureDirectionalScore,
  type FeatureDirectionalScores,
  type PatientInput,
  type PatientMetadata,
  type ReferenceStats,
  type RiskLabel,
  type ScoredFeatureKey,
  type ScoringResult,
  type ScoringRiskLabel
} from "../types.ts";

const METHOD_NOTE =
  "Research prototype output. Scores are cohort-relative, exploratory, and local to the active reference cohort.";

const DOMAIN_DEFINITIONS: Record<
  DomainScoreKey,
  {
    label: string;
    features: readonly ScoredFeatureKey[];
    requiredFeatureCount: number;
  }
> = {
  cardiac_kinetic_impairment_score: {
    label: "Cardiac kinetic impairment",
    features: [
      "max_contraction_velocity",
      "max_expansion_velocity",
      "per_ml_per_s",
      "fractional_wall_thickening",
      "ef_pct"
    ],
    requiredFeatureCount: 3
  },
  cardiac_remodelling_adiposity_score: {
    label: "Remodelling/adiposity",
    features: ["eat_volume", "lvmi_g_per_m2"],
    requiredFeatureCount: 1
  },
  myocardial_metabolic_impairment_score: {
    label: "Myocardial metabolic impairment",
    features: ["delta_suv_heart"],
    requiredFeatureCount: 1
  }
};

const INTERPRETATION_TEXT: Record<RiskLabel, string> = {
  "Very high relative burden":
    "Very high relative cardiac composite burden within the reference cohort.",
  "High relative burden":
    "High relative cardiac composite burden compared with the reference cohort.",
  "Moderate relative burden":
    "Moderate relative cardiac composite burden. Interpret as exploratory and cohort-relative.",
  "Low relative burden":
    "Low relative cardiac composite burden within the reference cohort."
};

export function computePercentile(
  value: number,
  referenceDistribution: readonly number[]
): number | null {
  if (!Number.isFinite(value) || referenceDistribution.length === 0) {
    return null;
  }

  const validReferenceValues = referenceDistribution.filter(Number.isFinite);
  if (validReferenceValues.length === 0) {
    return null;
  }

  const valuesLessThanOrEqual = validReferenceValues.filter(
    (referenceValue) => referenceValue <= value
  ).length;

  return round((valuesLessThanOrEqual / validReferenceValues.length) * 100, 1);
}

export function scorePatient(
  patient: PatientInput,
  referenceStats: ReferenceStats = defaultReferenceStats
): ScoringResult {
  const featureDirectionalZScores = computeFeatureDirectionalZScores(
    patient,
    referenceStats
  );
  const domainAvailability = computeDomainAvailability(featureDirectionalZScores);
  const domainScores = computeDomainScores(
    featureDirectionalZScores,
    domainAvailability
  );
  const domainPercentiles = computeDomainPercentiles(domainScores, referenceStats);
  const compositeScore = computeCompositeScore(domainScores);
  const compositePercentile =
    compositeScore === null
      ? null
      : computePercentile(compositeScore, referenceStats.compositeDistribution);
  const riskLabel = getRiskLabel(compositePercentile);

  return {
    patientMetadata: getPatientMetadata(patient),
    featureDirectionalZScores,
    domainScores,
    domainPercentiles,
    domainAvailability,
    compositeScore,
    compositePercentile,
    riskLabel,
    top3PositiveContributors: getTopPositiveContributors(
      featureDirectionalZScores
    ),
    missingRequiredFields: getMissingRequiredFields(domainAvailability),
    dataCompletenessPercentage: computeDataCompletenessPercentage(patient),
    interpretationText: getInterpretationText(riskLabel),
    methodNote: METHOD_NOTE
  };
}

function computeFeatureDirectionalZScores(
  patient: PatientInput,
  referenceStats: ReferenceStats
): FeatureDirectionalScores {
  const scores = {} as FeatureDirectionalScores;

  for (const feature of scoredFeatureKeys) {
    const value = patient[feature];
    if (!isFiniteNumber(value)) {
      scores[feature] = null;
      continue;
    }

    const featureReferenceStats = referenceStats.features[feature];
    if (
      !Number.isFinite(featureReferenceStats.mean) ||
      !Number.isFinite(featureReferenceStats.sd) ||
      featureReferenceStats.sd <= 0
    ) {
      throw new Error(`Invalid reference statistics for ${feature}.`);
    }

    const zScore = (value - featureReferenceStats.mean) / featureReferenceStats.sd;
    const directionalZScore = zScore * featureReferenceStats.direction;

    scores[feature] = {
      feature,
      label: featureReferenceStats.label,
      unit: featureReferenceStats.unit,
      value,
      referenceMean: featureReferenceStats.mean,
      referenceSd: featureReferenceStats.sd,
      direction: featureReferenceStats.direction,
      zScore: round(zScore, 3),
      directionalZScore: round(directionalZScore, 3)
    };
  }

  return scores;
}

function computeDomainAvailability(
  featureDirectionalZScores: FeatureDirectionalScores
): Record<DomainScoreKey, DomainAvailability> {
  const availability = {} as Record<DomainScoreKey, DomainAvailability>;

  for (const domainKey of domainScoreKeys) {
    const definition = DOMAIN_DEFINITIONS[domainKey];
    const availableFeatures = definition.features.filter(
      (feature) => featureDirectionalZScores[feature] !== null
    );
    const missingFeatures = definition.features.filter(
      (feature) => featureDirectionalZScores[feature] === null
    );
    const isAvailable =
      availableFeatures.length >= definition.requiredFeatureCount;

    availability[domainKey] = {
      label: definition.label,
      isAvailable,
      availableFeatureCount: availableFeatures.length,
      requiredFeatureCount: definition.requiredFeatureCount,
      availableFeatures,
      missingFeatures,
      reason: isAvailable
        ? null
        : `Requires at least ${definition.requiredFeatureCount} available feature(s); found ${availableFeatures.length}.`
    };
  }

  return availability;
}

function computeDomainScores(
  featureDirectionalZScores: FeatureDirectionalScores,
  domainAvailability: Record<DomainScoreKey, DomainAvailability>
): Record<DomainScoreKey, number | null> {
  const domainScores = {} as Record<DomainScoreKey, number | null>;

  for (const domainKey of domainScoreKeys) {
    if (!domainAvailability[domainKey].isAvailable) {
      domainScores[domainKey] = null;
      continue;
    }

    const availableFeatureScores = DOMAIN_DEFINITIONS[domainKey].features
      .map((feature) => featureDirectionalZScores[feature]?.directionalZScore)
      .filter(isFiniteNumber);

    domainScores[domainKey] = round(mean(availableFeatureScores), 3);
  }

  return domainScores;
}

function computeDomainPercentiles(
  domainScores: Record<DomainScoreKey, number | null>,
  referenceStats: ReferenceStats
): Record<DomainScoreKey, number | null> {
  const domainPercentiles = {} as Record<DomainScoreKey, number | null>;

  for (const domainKey of domainScoreKeys) {
    const domainScore = domainScores[domainKey];
    domainPercentiles[domainKey] =
      domainScore === null
        ? null
        : computePercentile(
            domainScore,
            referenceStats.domainDistributions[domainKey]
          );
  }

  return domainPercentiles;
}

function computeCompositeScore(
  domainScores: Record<DomainScoreKey, number | null>
): number | null {
  const availableDomainScores = domainScoreKeys
    .map((domainKey) => domainScores[domainKey])
    .filter(isFiniteNumber);

  if (availableDomainScores.length < 2) {
    return null;
  }

  return round(mean(availableDomainScores), 3);
}

function getRiskLabel(percentile: number | null): ScoringRiskLabel {
  if (percentile === null) {
    return "Insufficient data";
  }

  if (percentile < 50) {
    return "Low relative burden";
  }

  if (percentile < 75) {
    return "Moderate relative burden";
  }

  if (percentile < 90) {
    return "High relative burden";
  }

  return "Very high relative burden";
}

function getInterpretationText(riskLabel: ScoringRiskLabel): string {
  if (riskLabel === "Insufficient data") {
    return "Insufficient data to compute cardiac composite burden score.";
  }

  return INTERPRETATION_TEXT[riskLabel];
}

function getTopPositiveContributors(
  featureDirectionalZScores: FeatureDirectionalScores
): FeatureContribution[] {
  return scoredFeatureKeys
    .map((feature) => featureDirectionalZScores[feature])
    .filter((score): score is FeatureDirectionalScore => {
      return score !== null && score.directionalZScore > 0;
    })
    .sort((left, right) => {
      if (right.directionalZScore !== left.directionalZScore) {
        return right.directionalZScore - left.directionalZScore;
      }

      return left.feature.localeCompare(right.feature);
    })
    .slice(0, 3)
    .map((score) => ({
      feature: score.feature,
      label: score.label,
      unit: score.unit,
      value: score.value,
      directionalZScore: score.directionalZScore
    }));
}

function getMissingRequiredFields(
  domainAvailability: Record<DomainScoreKey, DomainAvailability>
): ScoredFeatureKey[] {
  const missingFields: ScoredFeatureKey[] = [];

  for (const domainKey of domainScoreKeys) {
    const availability = domainAvailability[domainKey];
    if (availability.isAvailable) {
      continue;
    }

    for (const feature of availability.missingFeatures) {
      if (!missingFields.includes(feature)) {
        missingFields.push(feature);
      }
    }
  }

  return missingFields;
}

function computeDataCompletenessPercentage(patient: PatientInput): number {
  const availableFeatureCount = scoredFeatureKeys.filter((feature) =>
    isFiniteNumber(patient[feature])
  ).length;

  return round((availableFeatureCount / scoredFeatureKeys.length) * 100, 1);
}

function getPatientMetadata(patient: PatientInput): PatientMetadata {
  return {
    subid: patient.subid,
    age: patient.age,
    sex: patient.sex,
    bmi: patient.bmi,
    bsa: patient.bsa
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
