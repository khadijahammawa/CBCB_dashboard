import Papa from "papaparse";
import { domainScoreKeys, scoredFeatureKeys } from "../types.ts";
import type {
  DomainScoreKey,
  PatientInput,
  ReferenceStats,
  ScoredFeatureKey,
  ScoringResult
} from "../types.ts";
import { scorePatient } from "./scoring.ts";

export const expectedCsvColumns = [
  "subid",
  "age",
  "sex",
  "bmi",
  "bsa",
  "brain_phenotype",
  "brain_binary",
  "vermis_feature",
  "stg_feature",
  "delta_suv_heart",
  "eat_volume",
  "lvmi_g_per_m2",
  "max_contraction_velocity",
  "max_expansion_velocity",
  "per_ml_per_s",
  "fractional_wall_thickening",
  "ef_pct"
] as const;

export type ExpectedCsvColumn = (typeof expectedCsvColumns)[number];

type CsvTemplateRow = Record<ExpectedCsvColumn, string | number>;

const numericCsvColumns = new Set<ExpectedCsvColumn>([
  "age",
  "bmi",
  "bsa",
  "brain_binary",
  "vermis_feature",
  "stg_feature",
  "delta_suv_heart",
  "eat_volume",
  "lvmi_g_per_m2",
  "max_contraction_velocity",
  "max_expansion_velocity",
  "per_ml_per_s",
  "fractional_wall_thickening",
  "ef_pct"
]);

export interface ParsedCsvDataset {
  patients: PatientInput[];
  rawRows: Array<Record<string, string>>;
  fields: string[];
  missingColumns: ExpectedCsvColumn[];
  rowCount: number;
}

export interface ScoredCsvRow {
  rowNumber: number;
  patient: PatientInput;
  result: ScoringResult;
}

export interface ReferenceBuildResult {
  referenceStats: ReferenceStats | null;
  scoredRows: ScoredCsvRow[];
  errors: string[];
  warnings: string[];
  usableRows: number;
  compositeDistributionCount: number;
}

const patientScoringTemplateRows: CsvTemplateRow[] = [
  {
    subid: "PATIENT_EXAMPLE_001",
    age: 58,
    sex: "F",
    bmi: 29.4,
    bsa: 1.78,
    brain_phenotype: "",
    brain_binary: "",
    vermis_feature: "",
    stg_feature: "",
    delta_suv_heart: 1.05,
    eat_volume: 110,
    lvmi_g_per_m2: 98,
    max_contraction_velocity: 70,
    max_expansion_velocity: 78,
    per_ml_per_s: 1.25,
    fractional_wall_thickening: 38,
    ef_pct: 58
  }
];

const referenceCohortTemplateRows: CsvTemplateRow[] = [
  {
    subid: "REF_EXAMPLE_001",
    age: 50,
    sex: "F",
    bmi: 24.2,
    bsa: 1.68,
    brain_phenotype: "bU[+]",
    brain_binary: 0,
    vermis_feature: 0.18,
    stg_feature: 0.22,
    delta_suv_heart: 1.58,
    eat_volume: 72,
    lvmi_g_per_m2: 78,
    max_contraction_velocity: 90,
    max_expansion_velocity: 104,
    per_ml_per_s: 1.72,
    fractional_wall_thickening: 53,
    ef_pct: 72
  },
  {
    subid: "REF_EXAMPLE_002",
    age: 58,
    sex: "M",
    bmi: 27.1,
    bsa: 1.91,
    brain_phenotype: "bU[+]",
    brain_binary: 0,
    vermis_feature: 0.29,
    stg_feature: 0.31,
    delta_suv_heart: 1.28,
    eat_volume: 94,
    lvmi_g_per_m2: 88,
    max_contraction_velocity: 78,
    max_expansion_velocity: 88,
    per_ml_per_s: 1.44,
    fractional_wall_thickening: 43,
    ef_pct: 63
  },
  {
    subid: "REF_EXAMPLE_003",
    age: 66,
    sex: "F",
    bmi: 30.6,
    bsa: 1.82,
    brain_phenotype: "bU[-]",
    brain_binary: 1,
    vermis_feature: 0.56,
    stg_feature: 0.61,
    delta_suv_heart: 0.98,
    eat_volume: 124,
    lvmi_g_per_m2: 108,
    max_contraction_velocity: 63,
    max_expansion_velocity: 70,
    per_ml_per_s: 1.1,
    fractional_wall_thickening: 34,
    ef_pct: 52
  },
  {
    subid: "REF_EXAMPLE_004",
    age: 71,
    sex: "M",
    bmi: 33.4,
    bsa: 2.02,
    brain_phenotype: "bU[-]",
    brain_binary: 1,
    vermis_feature: 0.72,
    stg_feature: 0.78,
    delta_suv_heart: 0.76,
    eat_volume: 146,
    lvmi_g_per_m2: 122,
    max_contraction_velocity: 55,
    max_expansion_velocity: 61,
    per_ml_per_s: 0.92,
    fractional_wall_thickening: 28,
    ef_pct: 45
  }
];

export function createPatientScoringTemplateCsv(): string {
  return rowsToTemplateCsv(patientScoringTemplateRows);
}

export function createReferenceCohortTemplateCsv(): string {
  return rowsToTemplateCsv(referenceCohortTemplateRows);
}

export function parseCsvFile(file: File): Promise<ParsedCsvDataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      transform: (value) => value.trim(),
      complete: (results) => {
        const parseErrors = results.errors
          .filter((error) => error.code !== "TooFewFields")
          .map((error) => `Row ${error.row ?? "unknown"}: ${error.message}`);

        if (parseErrors.length > 0) {
          reject(new Error(parseErrors.join(" ")));
          return;
        }

        resolve(createParsedDataset(results.data, results.meta.fields ?? []));
      },
      error: (error) => reject(error)
    });
  });
}

function rowsToTemplateCsv(rows: readonly CsvTemplateRow[]): string {
  return Papa.unparse({
    fields: Array.from(expectedCsvColumns),
    data: rows.map((row) =>
      expectedCsvColumns.map((column) => row[column])
    )
  });
}

export function parseCsvText(csvText: string): ParsedCsvDataset {
  const results = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim()
  });
  const parseErrors = results.errors
    .filter((error) => error.code !== "TooFewFields")
    .map((error) => `Row ${error.row ?? "unknown"}: ${error.message}`);

  if (parseErrors.length > 0) {
    throw new Error(parseErrors.join(" "));
  }

  return createParsedDataset(results.data, results.meta.fields ?? []);
}

export function scoreCsvPatients(
  patients: readonly PatientInput[],
  referenceStats: ReferenceStats
): ScoredCsvRow[] {
  return patients.map((patient, index) => ({
    rowNumber: index + 2,
    patient,
    result: scorePatient(patient, referenceStats)
  }));
}

export function buildReferenceStatsFromPatients(
  patients: readonly PatientInput[],
  baseReferenceStats: ReferenceStats
): ReferenceBuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const features = {} as ReferenceStats["features"];

  for (const feature of scoredFeatureKeys) {
    const values = patients
      .map((patient) => patient[feature])
      .filter(isFiniteNumber);

    if (values.length < 2) {
      errors.push(
        `${baseReferenceStats.features[feature].label} needs at least 2 numeric values to compute a reference SD.`
      );
      continue;
    }

    const featureSd = sampleSd(values);
    if (!Number.isFinite(featureSd) || featureSd <= 0) {
      errors.push(
        `${baseReferenceStats.features[feature].label} has zero or invalid variance in the uploaded cohort.`
      );
      continue;
    }

    features[feature] = {
      ...baseReferenceStats.features[feature],
      mean: round(mean(values), 4),
      sd: round(featureSd, 4)
    };
  }

  if (errors.length > 0) {
    return {
      referenceStats: null,
      scoredRows: [],
      errors,
      warnings,
      usableRows: patients.length,
      compositeDistributionCount: 0
    };
  }

  const provisionalReferenceStats: ReferenceStats = {
    features,
    compositeDistribution: [],
    domainDistributions: {
      cardiac_kinetic_impairment_score: [],
      cardiac_remodelling_adiposity_score: [],
      myocardial_metabolic_impairment_score: [],
      cardiac_composite_burden_score: []
    }
  };

  const scoredRows = scoreCsvPatients(patients, provisionalReferenceStats);
  const domainDistributions = {
    cardiac_kinetic_impairment_score: collectDomainDistribution(
      scoredRows,
      "cardiac_kinetic_impairment_score"
    ),
    cardiac_remodelling_adiposity_score: collectDomainDistribution(
      scoredRows,
      "cardiac_remodelling_adiposity_score"
    ),
    myocardial_metabolic_impairment_score: collectDomainDistribution(
      scoredRows,
      "myocardial_metabolic_impairment_score"
    ),
    cardiac_composite_burden_score: scoredRows
      .map((row) => row.result.compositeScore)
      .filter(isFiniteNumber)
  };

  if (domainDistributions.cardiac_composite_burden_score.length === 0) {
    errors.push(
      "Uploaded cohort did not contain enough computable rows to create a composite score distribution."
    );
    return {
      referenceStats: null,
      scoredRows,
      errors,
      warnings,
      usableRows: patients.length,
      compositeDistributionCount: 0
    };
  }

  for (const domainKey of domainScoreKeys) {
    if (domainDistributions[domainKey].length === 0) {
      warnings.push(
        `${domainKey} has no computable rows in the uploaded reference cohort.`
      );
    }
  }

  const referenceStats: ReferenceStats = {
    features,
    compositeDistribution:
      domainDistributions.cardiac_composite_burden_score,
    domainDistributions
  };

  return {
    referenceStats,
    scoredRows: scoreCsvPatients(patients, referenceStats),
    errors,
    warnings,
    usableRows: patients.length,
    compositeDistributionCount:
      domainDistributions.cardiac_composite_burden_score.length
  };
}

export function scoredRowsToCsv(scoredRows: readonly ScoredCsvRow[]): string {
  return Papa.unparse(
    scoredRows.map((row) => ({
      row_number: row.rowNumber,
      scoring_status:
        row.result.compositeScore === null ? "insufficient" : "scored",
      insufficient_reason:
        row.result.compositeScore === null
          ? buildInsufficientReason(row.result)
          : "",
      ...patientToExportRow(row.patient),
      composite_score: formatExportNumber(row.result.compositeScore),
      composite_percentile: formatExportNumber(row.result.compositePercentile),
      risk_label: row.result.riskLabel,
      cardiac_kinetic_impairment_score: formatExportNumber(
        row.result.domainScores.cardiac_kinetic_impairment_score
      ),
      cardiac_remodelling_adiposity_score: formatExportNumber(
        row.result.domainScores.cardiac_remodelling_adiposity_score
      ),
      myocardial_metabolic_impairment_score: formatExportNumber(
        row.result.domainScores.myocardial_metabolic_impairment_score
      ),
      data_completeness_percentage: formatExportNumber(
        row.result.dataCompletenessPercentage
      ),
      top_positive_contributors: row.result.top3PositiveContributors
        .map(
          (contributor) =>
            `${contributor.label} (${contributor.directionalZScore})`
        )
        .join("; "),
      interpretation_text: row.result.interpretationText
    }))
  );
}

function createParsedDataset(
  rows: Array<Record<string, string>>,
  fields: readonly string[]
): ParsedCsvDataset {
  const normalizedFields = fields.map((field) => field.trim()).filter(Boolean);
  const rawRows = rows
    .map(normalizeRow)
    .filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== "")
    );

  return {
    patients: rawRows.map(csvRowToPatient),
    rawRows,
    fields: normalizedFields,
    missingColumns: expectedCsvColumns.filter(
      (column) => !normalizedFields.includes(column)
    ),
    rowCount: rawRows.length
  };
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim(), value.trim()])
  );
}

function csvRowToPatient(row: Record<string, string>): PatientInput {
  const patient: PatientInput = {};
  const patientRecord = patient as Record<ExpectedCsvColumn, string | number | undefined>;

  for (const column of expectedCsvColumns) {
    const value = row[column]?.trim();
    if (!value) {
      continue;
    }

    if (numericCsvColumns.has(column)) {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        patientRecord[column] = numericValue;
      }
    } else {
      patientRecord[column] = value;
    }
  }

  return patient;
}

function patientToExportRow(
  patient: PatientInput
): Record<ExpectedCsvColumn, string | number> {
  return Object.fromEntries(
    expectedCsvColumns.map((column) => [column, patient[column] ?? ""])
  ) as Record<ExpectedCsvColumn, string | number>;
}

function collectDomainDistribution(
  scoredRows: readonly ScoredCsvRow[],
  domainKey: DomainScoreKey
): number[] {
  return scoredRows
    .map((row) => row.result.domainScores[domainKey])
    .filter(isFiniteNumber);
}

function buildInsufficientReason(result: ScoringResult): string {
  const unavailableDomains = domainScoreKeys
    .filter((domainKey) => result.domainScores[domainKey] === null)
    .map((domainKey) => result.domainAvailability[domainKey].reason)
    .filter(Boolean);

  return unavailableDomains.join(" ");
}

function formatExportNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleSd(values: readonly number[]): number {
  const valueMean = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - valueMean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
