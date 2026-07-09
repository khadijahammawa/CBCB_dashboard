import { demoPatientOrder, demoPatients } from "./data/demoPatients.ts";
import { referenceStats } from "./data/referenceStats.ts";
import {
  buildReferenceStatsFromPatients,
  createPatientScoringTemplateCsv,
  createReferenceCohortTemplateCsv,
  expectedCsvColumns,
  parseCsvText,
  scoreCsvPatients,
  scoredRowsToCsv
} from "./lib/csv.ts";
import { scorePatient } from "./lib/scoring.ts";
import type { DemoPatientKey } from "./data/demoPatients.ts";
import type { RiskLabel } from "./types.ts";

const expectedRiskLabels: Record<DemoPatientKey, RiskLabel> = {
  lowBurden: "Low relative burden",
  moderateBurden: "Moderate relative burden",
  highBurden: "High relative burden"
};

const results = demoPatientOrder.map((demoPatientKey) => {
  const patient = demoPatients[demoPatientKey];
  const result = scorePatient(patient);

  assert(
    result.compositeScore !== null,
    `${demoPatientKey} should produce a composite score.`
  );
  assert(
    result.compositePercentile !== null,
    `${demoPatientKey} should produce a composite percentile.`
  );
  assert(
    result.riskLabel === expectedRiskLabels[demoPatientKey],
    `${demoPatientKey} expected ${expectedRiskLabels[demoPatientKey]}, got ${result.riskLabel}.`
  );
  assert(
    result.missingRequiredFields.length === 0,
    `${demoPatientKey} should not have missing required fields.`
  );
  assert(
    result.dataCompletenessPercentage === 100,
    `${demoPatientKey} should be 100% complete for scoring features.`
  );

  return {
    demoPatient: demoPatientKey,
    subid: patient.subid,
    compositeScore: result.compositeScore,
    compositePercentile: result.compositePercentile,
    riskLabel: result.riskLabel,
    topContributor: result.top3PositiveContributors[0]?.label ?? "None"
  };
});

assert(
  results[0].compositeScore < results[1].compositeScore &&
    results[1].compositeScore < results[2].compositeScore,
  "Demo patient composite scores should increase from low to high burden."
);

console.table(results);
runCsvTests();
console.log("Console scoring tests passed.");

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCsvTests(): void {
  const csvText = [
    expectedCsvColumns.join(","),
    csvRow("lowBurden"),
    csvRow("moderateBurden"),
    csvRow("highBurden")
  ].join("\n");
  const parsed = parseCsvText(csvText);
  const scoredRows = scoreCsvPatients(parsed.patients, referenceStats);
  const referenceBuild = buildReferenceStatsFromPatients(
    parsed.patients,
    referenceStats
  );
  const exportedCsv = scoredRowsToCsv(scoredRows);
  const patientTemplate = parseCsvText(createPatientScoringTemplateCsv());
  const referenceTemplate = parseCsvText(createReferenceCohortTemplateCsv());
  const patientTemplateScore = scoreCsvPatients(
    patientTemplate.patients,
    referenceStats
  )[0];
  const referenceTemplateBuild = buildReferenceStatsFromPatients(
    referenceTemplate.patients,
    referenceStats
  );

  assert(parsed.rowCount === 3, "CSV parser should return 3 patient rows.");
  assert(
    parsed.missingColumns.length === 0,
    "CSV parser should report no missing columns for complete test CSV."
  );
  assert(
    scoredRows[2].result.riskLabel === "High relative burden",
    "CSV batch scoring should preserve high-burden demo risk label."
  );
  assert(
    referenceBuild.referenceStats !== null,
    "Reference cohort build should succeed for complete synthetic CSV."
  );
  assert(
    referenceBuild.compositeDistributionCount === 3,
    "Reference cohort build should produce 3 composite distribution values."
  );
  assert(
    exportedCsv.includes("composite_score") &&
      exportedCsv.includes("scoring_status"),
    "Scored CSV export should include scoring columns."
  );
  assert(
    patientTemplate.missingColumns.length === 0 &&
      referenceTemplate.missingColumns.length === 0,
    "Generated CSV templates should include every expected upload column."
  );
  assert(
    patientTemplate.rowCount === 1,
    "Patient scoring template should include 1 example row."
  );
  assert(
    patientTemplateScore.result.compositeScore !== null,
    "Patient scoring template example row should be scoreable."
  );
  assert(
    referenceTemplate.rowCount === 4,
    "Reference cohort template should include 4 synthetic example rows."
  );
  assert(
    referenceTemplate.rawRows.some((row) => row.brain_phenotype === "bU[-]"),
    "Reference cohort template should include optional brain phenotype context."
  );
  assert(
    referenceTemplateBuild.referenceStats !== null,
    "Reference cohort template should be sufficient to build temporary reference stats."
  );
}

function csvRow(demoPatientKey: DemoPatientKey): string {
  const patient = demoPatients[demoPatientKey];
  const patientRecord = patient as Record<string, string | number | undefined>;

  return expectedCsvColumns
    .map((column) => String(patientRecord[column] ?? ""))
    .join(",");
}
