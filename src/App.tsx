import { useEffect, useMemo, useRef, useState } from "react";
import { demoPatients, type DemoPatientKey } from "./data/demoPatients.ts";
import { referenceStats as bundledReferenceStats } from "./data/referenceStats.ts";
import {
  buildReferenceStatsFromPatients,
  createPatientScoringTemplateCsv,
  createReferenceCohortTemplateCsv,
  expectedCsvColumns,
  parseCsvFile,
  scoreCsvPatients,
  scoredRowsToCsv,
  type ParsedCsvDataset,
  type ScoredCsvRow
} from "./lib/csv.ts";
import { scorePatient } from "./lib/scoring.ts";
import {
  brainContextKeys,
  domainScoreKeys,
  type DomainScoreKey,
  type ManualPatientInput,
  type PatientInput,
  type ReferenceStats,
  type ScoredFeatureKey,
  type ScoringResult
} from "./types.ts";

type FormField = keyof ManualPatientInput;
type CsvMode = "batch" | "reference";
type ReferenceSource = "bundled" | "temporary";
type ThemeMode = "dark" | "light";

interface FieldConfig {
  key: FormField;
  label: string;
  unit?: string;
  type?: "number" | "text" | "select";
  step?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

interface FormSection {
  title: string;
  accentClass: string;
  helper?: string;
  fields: FieldConfig[];
}

const emptyFormValues: Record<FormField, string> = {
  subid: "",
  age: "",
  sex: "",
  bmi: "",
  bsa: "",
  delta_suv_heart: "",
  eat_volume: "",
  lvmi_g_per_m2: "",
  max_contraction_velocity: "",
  max_expansion_velocity: "",
  per_ml_per_s: "",
  fractional_wall_thickening: "",
  ef_pct: ""
};

const numericFields = new Set<FormField>([
  "age",
  "bmi",
  "bsa",
  "delta_suv_heart",
  "eat_volume",
  "lvmi_g_per_m2",
  "max_contraction_velocity",
  "max_expansion_velocity",
  "per_ml_per_s",
  "fractional_wall_thickening",
  "ef_pct"
]);

const formSections: FormSection[] = [
  {
    title: "Patient metadata",
    accentClass: "border-violet-400/50 text-violet-200",
    fields: [
      { key: "subid", label: "Patient ID", placeholder: "Manual patient" },
      { key: "age", label: "Age", type: "number", step: "1" },
      {
        key: "sex",
        label: "Sex",
        type: "select",
        options: [
          { label: "Select", value: "" },
          { label: "Female", value: "F" },
          { label: "Male", value: "M" },
          { label: "Other / unknown", value: "Other/unknown" }
        ]
      },
      { key: "bmi", label: "BMI", type: "number", step: "0.1" },
      { key: "bsa", label: "BSA", unit: "m2", type: "number", step: "0.01" }
    ]
  },
  {
    title: "Myocardial metabolic input",
    accentClass: "border-teal-300/60 text-teal-200",
    fields: [
      {
        key: "delta_suv_heart",
        label: "Delta SUV heart",
        unit: bundledReferenceStats.features.delta_suv_heart.unit,
        type: "number",
        step: "0.01"
      }
    ]
  },
  {
    title: "Remodelling/adiposity inputs",
    accentClass: "border-amber-300/60 text-amber-200",
    fields: [
      {
        key: "eat_volume",
        label: "EAT volume",
        unit: bundledReferenceStats.features.eat_volume.unit,
        type: "number",
        step: "0.1"
      },
      {
        key: "lvmi_g_per_m2",
        label: "LV mass index",
        unit: bundledReferenceStats.features.lvmi_g_per_m2.unit,
        type: "number",
        step: "0.1"
      }
    ]
  },
  {
    title: "Cardiac kinetic inputs",
    accentClass: "border-rose-300/60 text-rose-200",
    fields: [
      {
        key: "max_contraction_velocity",
        label: "Max contraction velocity",
        unit: bundledReferenceStats.features.max_contraction_velocity.unit,
        type: "number",
        step: "0.1"
      },
      {
        key: "max_expansion_velocity",
        label: "Max expansion velocity",
        unit: bundledReferenceStats.features.max_expansion_velocity.unit,
        type: "number",
        step: "0.1"
      },
      {
        key: "per_ml_per_s",
        label: "PER",
        unit: bundledReferenceStats.features.per_ml_per_s.unit,
        type: "number",
        step: "0.01"
      },
      {
        key: "fractional_wall_thickening",
        label: "Fractional wall thickening",
        unit: bundledReferenceStats.features.fractional_wall_thickening.unit,
        type: "number",
        step: "0.1"
      },
      {
        key: "ef_pct",
        label: "Ejection fraction",
        unit: bundledReferenceStats.features.ef_pct.unit,
        type: "number",
        step: "0.1"
      }
    ]
  }
];

const domainDisplay: Record<
  DomainScoreKey,
  { label: string; accent: string; dot: string }
> = {
  cardiac_kinetic_impairment_score: {
    label: "Cardiac kinetic impairment",
    accent: "border-rose-300/40 bg-rose-400/[0.08]",
    dot: "bg-rose-300"
  },
  cardiac_remodelling_adiposity_score: {
    label: "Remodelling/adiposity",
    accent: "border-amber-300/40 bg-amber-400/[0.08]",
    dot: "bg-amber-300"
  },
  myocardial_metabolic_impairment_score: {
    label: "Myocardial metabolic impairment",
    accent: "border-teal-300/40 bg-teal-400/[0.08]",
    dot: "bg-teal-300"
  }
};

const demoButtons: Array<{ key: DemoPatientKey; label: string }> = [
  { key: "lowBurden", label: "Load demo low-burden patient" },
  { key: "moderateBurden", label: "Load demo moderate-burden patient" },
  { key: "highBurden", label: "Load demo high-burden patient" }
];

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [formValues, setFormValues] =
    useState<Record<FormField, string>>(emptyFormValues);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [lastScoredPatient, setLastScoredPatient] =
    useState<PatientInput | null>(null);
  const [lastAction, setLastAction] = useState("No patient scored yet.");
  const [activeReferenceStats, setActiveReferenceStats] =
    useState<ReferenceStats>(bundledReferenceStats);
  const [referenceSource, setReferenceSource] =
    useState<ReferenceSource>("bundled");
  const [referenceMessage, setReferenceMessage] = useState(
    "Using bundled referenceStats.ts."
  );
  const [csvMode, setCsvMode] = useState<CsvMode>("batch");
  const [csvDataset, setCsvDataset] = useState<ParsedCsvDataset | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [batchRows, setBatchRows] = useState<ScoredCsvRow[]>([]);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState("");
  const [referenceSummary, setReferenceSummary] = useState<{
    rows: number;
    compositeDistributionCount: number;
  } | null>(null);

  const patientDraft = useMemo(() => parsePatientInput(formValues), [formValues]);
  const availableDomainCount =
    result === null
      ? 0
      : domainScoreKeys.filter((domainKey) => result.domainScores[domainKey] !== null)
          .length;
  const compositeUnavailableReason =
    result !== null && result.compositeScore === null
      ? buildCompositeUnavailableReason(result)
      : null;
  const insufficientBatchCount = batchRows.filter(
    (row) => row.result.compositeScore === null
  ).length;
  const selectedCohortPatient =
    selectedBatchIndex === ""
      ? null
      : batchRows[Number(selectedBatchIndex)]?.patient ?? null;

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;

    try {
      window.localStorage.setItem("cbcb-theme", themeMode);
    } catch {
      // Theme persistence is optional; the toggle still works if storage is blocked.
    }
  }, [themeMode]);

  function updateField(field: FormField, value: string): void {
    setFormValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function calculateScore(): void {
    scoreAndDisplayPatient(patientDraft, "Calculated against the active reference cohort.");
  }

  function toggleThemeMode(): void {
    setThemeMode((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark"
    );
  }

  function loadDemoPatient(demoPatientKey: DemoPatientKey): void {
    const patient = demoPatients[demoPatientKey];
    setFormValues(patientToFormValues(patient));
    scoreAndDisplayPatient(
      patient,
      "Demo patient loaded and scored against the active reference cohort."
    );
  }

  function clearForm(): void {
    setFormValues(emptyFormValues);
    setResult(null);
    setLastScoredPatient(null);
    setSelectedBatchIndex("");
    setLastAction("Form cleared.");
  }

  async function handleCsvUpload(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }

    try {
      setCsvError(null);
      setCsvWarnings([]);
      const dataset = await parseCsvFile(file);
      setCsvDataset(dataset);
      setCsvFileName(file.name);
      processCsvDataset(dataset, csvMode, activeReferenceStats);
    } catch (error) {
      setCsvDataset(null);
      setBatchRows([]);
      setSelectedBatchIndex("");
      setCsvFileName(file.name);
      setCsvError(error instanceof Error ? error.message : String(error));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleCsvModeChange(nextMode: CsvMode): void {
    setCsvMode(nextMode);
    if (csvDataset) {
      processCsvDataset(csvDataset, nextMode, activeReferenceStats);
    }
  }

  function processCsvDataset(
    dataset: ParsedCsvDataset,
    mode: CsvMode,
    referenceStatsForScoring: ReferenceStats
  ): void {
    if (mode === "batch") {
      const scoredRows = scoreCsvPatients(dataset.patients, referenceStatsForScoring);
      setBatchRows(scoredRows);
      setCsvWarnings([]);
      setReferenceSummary(null);

      if (scoredRows.length > 0) {
        setSelectedBatchIndex("0");
        displayBatchRow(scoredRows[0], 0);
      } else {
        setSelectedBatchIndex("");
        setLastAction("CSV parsed, but no patient rows were found.");
      }
      return;
    }

    const referenceBuild = buildReferenceStatsFromPatients(
      dataset.patients,
      bundledReferenceStats
    );
    setCsvWarnings(referenceBuild.warnings);
    setBatchRows([]);
    setSelectedBatchIndex("");

    if (referenceBuild.referenceStats === null) {
      setReferenceSummary(null);
      setCsvError(referenceBuild.errors.join(" "));
      setLastAction("Reference cohort upload could not be applied.");
      return;
    }

    setCsvError(null);
    setActiveReferenceStats(referenceBuild.referenceStats);
    setReferenceSource("temporary");
    setReferenceMessage("Reference cohort updated for this session only.");
    setReferenceSummary({
      rows: referenceBuild.usableRows,
      compositeDistributionCount: referenceBuild.compositeDistributionCount
    });
    setLastAction("Temporary reference cohort loaded for this session only.");

    if (lastScoredPatient) {
      scoreAndDisplayPatient(
        lastScoredPatient,
        "Current patient rescored against the temporary reference cohort.",
        referenceBuild.referenceStats
      );
    }
  }

  function displayBatchRow(row: ScoredCsvRow, index: number): void {
    setFormValues(patientToFormValues(row.patient));
    setResult(row.result);
    setLastScoredPatient(row.patient);
    setSelectedBatchIndex(String(index));
    setLastAction(`Selected CSV row ${row.rowNumber}.`);
  }

  function handleBatchSelection(value: string): void {
    const index = Number(value);
    const row = batchRows[index];
    if (!row) {
      return;
    }

    displayBatchRow(row, index);
  }

  function exportScoredCsv(): void {
    if (batchRows.length === 0) {
      return;
    }

    downloadCsv(
      "brain_associated_cardiac_burden_scored_results.csv",
      scoredRowsToCsv(batchRows)
    );
  }

  function downloadPatientScoringTemplate(): void {
    downloadCsv(
      "brain_associated_cardiac_patient_scoring_template.csv",
      createPatientScoringTemplateCsv()
    );
  }

  function downloadReferenceCohortTemplate(): void {
    downloadCsv(
      "brain_associated_cardiac_reference_cohort_template.csv",
      createReferenceCohortTemplateCsv()
    );
  }

  function resetToBundledReference(): void {
    setActiveReferenceStats(bundledReferenceStats);
    setReferenceSource("bundled");
    setReferenceMessage("Using bundled referenceStats.ts.");
    setReferenceSummary(null);
    setCsvWarnings([]);

    const rescoredBatchRows =
      batchRows.length > 0
        ? scoreCsvPatients(
            batchRows.map((row) => row.patient),
            bundledReferenceStats
          )
        : [];
    setBatchRows(rescoredBatchRows);

    if (lastScoredPatient) {
      scoreAndDisplayPatient(
        lastScoredPatient,
        "Reset to bundled reference and rescored the current patient.",
        bundledReferenceStats
      );
    } else {
      setLastAction("Reset to bundled referenceStats.ts.");
    }

    if (selectedBatchIndex !== "" && rescoredBatchRows[Number(selectedBatchIndex)]) {
      displayBatchRow(
        rescoredBatchRows[Number(selectedBatchIndex)],
        Number(selectedBatchIndex)
      );
    }
  }

  function scoreAndDisplayPatient(
    patient: PatientInput,
    actionText: string,
    referenceStatsForScoring = activeReferenceStats
  ): void {
    const nextResult = scorePatient(patient, referenceStatsForScoring);
    setResult(nextResult);
    setLastScoredPatient(patient);
    setLastAction(
      nextResult.compositeScore === null
        ? "Calculated with insufficient cardiac data for a composite score."
        : actionText
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
        <header className="rounded-lg border border-white/10 bg-white/[0.055] px-5 py-5 shadow-glass backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
                Local cardiac-reference scoring
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white md:text-4xl">
                Brain-Associated Cardiac Burden Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                Research prototype for cardiac signatures associated with brain
                FDG-PET phenotypes in Type 2 Diabetes
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
              <ThemeToggle mode={themeMode} onToggle={toggleThemeMode} />
              <div className="inline-flex w-fit items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                Research prototype only {"\u2014"} not for clinical use
              </div>
            </div>
          </div>
        </header>

        <CsvControls
          batchRows={batchRows}
          csvDataset={csvDataset}
          csvError={csvError}
          csvFileName={csvFileName}
          csvMode={csvMode}
          csvWarnings={csvWarnings}
          fileInputRef={fileInputRef}
          insufficientBatchCount={insufficientBatchCount}
          referenceMessage={referenceMessage}
          referenceSource={referenceSource}
          referenceSummary={referenceSummary}
          selectedBatchIndex={selectedBatchIndex}
          onBatchSelection={handleBatchSelection}
          onCsvModeChange={handleCsvModeChange}
          onCsvUpload={handleCsvUpload}
          onDownloadPatientTemplate={downloadPatientScoringTemplate}
          onDownloadReferenceTemplate={downloadReferenceCohortTemplate}
          onExport={exportScoredCsv}
          onResetReference={resetToBundledReference}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.1fr)]">
          <section className="rounded-lg border border-white/10 bg-clinical-panel/80 p-4 shadow-glass backdrop-blur md:p-5">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Manual patient input</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Missing cardiac values are allowed. Scoring uses the active
                  local reference cohort.
                </p>
              </div>
              <span className="text-xs text-slate-500">{lastAction}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="primary-button" type="button" onClick={calculateScore}>
                Calculate score
              </button>
              {demoButtons.map((button) => (
                <button
                  className="secondary-button"
                  key={button.key}
                  type="button"
                  onClick={() => loadDemoPatient(button.key)}
                >
                  {button.label}
                </button>
              ))}
              <button className="ghost-button" type="button" onClick={clearForm}>
                Clear form
              </button>
            </div>

            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                calculateScore();
              }}
            >
              {formSections.map((section) => (
                <section
                  className="rounded-lg border border-white/10 bg-white/[0.045] p-4"
                  key={section.title}
                >
                  <div className={`border-l-2 pl-3 ${section.accentClass}`}>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em]">
                      {section.title}
                    </h3>
                    {section.helper ? (
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {section.helper}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <FieldInput
                        field={field}
                        key={field.key}
                        value={formValues[field.key]}
                        onChange={(value) => updateField(field.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </form>
          </section>

          <section className="grid content-start gap-5">
            <ScoreSummary
              availableDomainCount={availableDomainCount}
              compositeUnavailableReason={compositeUnavailableReason}
              result={result}
            />
            <SignatureInterpretation result={result} />
            <DomainSummary result={result} />
            <ContributorSummary result={result} />
            <CohortAssociationContext patient={selectedCohortPatient} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ThemeToggle({
  mode,
  onToggle
}: {
  mode: ThemeMode;
  onToggle: () => void;
}) {
  const nextMode = mode === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextMode} mode`}
      aria-pressed={mode === "light"}
      className="theme-toggle"
      data-mode={mode}
      type="button"
      onClick={onToggle}
    >
      <span>Light</span>
      <span>Dark</span>
      <span aria-hidden="true" className="theme-toggle-thumb" />
    </button>
  );
}

function CsvControls({
  batchRows,
  csvDataset,
  csvError,
  csvFileName,
  csvMode,
  csvWarnings,
  fileInputRef,
  insufficientBatchCount,
  referenceMessage,
  referenceSource,
  referenceSummary,
  selectedBatchIndex,
  onBatchSelection,
  onCsvModeChange,
  onCsvUpload,
  onDownloadPatientTemplate,
  onDownloadReferenceTemplate,
  onExport,
  onResetReference
}: {
  batchRows: ScoredCsvRow[];
  csvDataset: ParsedCsvDataset | null;
  csvError: string | null;
  csvFileName: string;
  csvMode: CsvMode;
  csvWarnings: string[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  insufficientBatchCount: number;
  referenceMessage: string;
  referenceSource: ReferenceSource;
  referenceSummary: { rows: number; compositeDistributionCount: number } | null;
  selectedBatchIndex: string;
  onBatchSelection: (value: string) => void;
  onCsvModeChange: (mode: CsvMode) => void;
  onCsvUpload: (file: File | undefined) => void;
  onDownloadPatientTemplate: () => void;
  onDownloadReferenceTemplate: () => void;
  onExport: () => void;
  onResetReference: () => void;
}) {
  const scoredBatchCount = batchRows.length - insufficientBatchCount;

  return (
    <section className="rounded-lg border border-white/10 bg-clinical-panel/80 p-4 shadow-glass backdrop-blur md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">CSV upload</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            PapaParse reads CSV files locally in the browser. No backend,
            database, external API, or persistence is used.
          </p>
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            referenceSource === "temporary"
              ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
              : "border-violet-300/30 bg-violet-300/10 text-violet-100"
          }`}
        >
          {referenceMessage}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,0.75fr)_minmax(300px,1fr)_minmax(260px,0.75fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Upload CSV
          </p>
          <input
            ref={fileInputRef}
            accept=".csv,text/csv"
            className="mt-3 block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-violet-300/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-100 hover:file:bg-violet-300/25"
            type="file"
            onChange={(event) => onCsvUpload(event.target.files?.[0])}
          />
          <p className="mt-3 text-sm text-slate-400">
            {csvFileName ? `Loaded: ${csvFileName}` : "No CSV loaded."}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Mode
          </p>
          <div className="mt-3 grid gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-slate-950/25 p-3 text-sm text-slate-200">
              <input
                checked={csvMode === "batch"}
                className="mt-1"
                name="csvMode"
                type="radio"
                onChange={() => onCsvModeChange("batch")}
              />
              <span>
                <span className="font-semibold">
                  Score patients using bundled reference
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Scores uploaded patient rows against the active local reference.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-slate-950/25 p-3 text-sm text-slate-200">
              <input
                checked={csvMode === "reference"}
                className="mt-1"
                name="csvMode"
                type="radio"
                onChange={() => onCsvModeChange("reference")}
              />
              <span>
                <span className="font-semibold">
                  Use uploaded CSV as temporary reference cohort
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Computes feature means, SDs, and score distributions for this
                  session only.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Batch controls
          </p>
          <label className="mt-3 block text-sm text-slate-300">
            Patient selector
            <select
              className="mt-1 min-h-11 w-full rounded-md border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none"
              disabled={batchRows.length === 0}
              value={selectedBatchIndex}
              onChange={(event) => onBatchSelection(event.target.value)}
            >
              <option value="">No patient batch loaded</option>
              {batchRows.map((row, index) => (
                <option key={`${row.rowNumber}-${index}`} value={String(index)}>
                  {row.patient.subid ?? `CSV row ${row.rowNumber}`} -{" "}
                  {row.result.compositeScore === null
                    ? "insufficient"
                    : row.result.riskLabel}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={batchRows.length === 0}
              type="button"
              onClick={onExport}
            >
              Export scored CSV
            </button>
            <button className="ghost-button" type="button" onClick={onResetReference}>
              Reset to bundled reference
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-teal-300/20 bg-teal-300/[0.055] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-200">
              CSV templates
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Download a parse-ready template before uploading patient rows or a
              temporary reference cohort. Brain FDG-PET columns are optional
              context only and are not used in the cardiac composite burden score.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Reference cohort uploads need at least two numeric values with
              non-zero variance for each scored cardiac feature.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              className="secondary-button"
              type="button"
              onClick={onDownloadPatientTemplate}
            >
              Download patient scoring template
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onDownloadReferenceTemplate}
            >
              Download reference cohort template
            </button>
          </div>
        </div>
      </div>

      {referenceSource === "temporary" ? (
        <p className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">
          Reference cohort updated for this session only.
        </p>
      ) : null}

      {csvError ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {csvError}
        </p>
      ) : null}

      {csvDataset ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,0.45fr)_minmax(360px,1fr)]">
          <div className="grid gap-3">
            <CsvMetric label="Rows parsed" value={String(csvDataset.rowCount)} />
            <CsvMetric
              label="Rows scored"
              value={
                batchRows.length > 0
                  ? `${scoredBatchCount} scored / ${insufficientBatchCount} insufficient`
                  : referenceSummary
                    ? `${referenceSummary.compositeDistributionCount} reference composites`
                    : "--"
              }
            />
            <CsvMetric
              label="Missing columns"
              value={
                csvDataset.missingColumns.length === 0
                  ? "None"
                  : csvDataset.missingColumns.join(", ")
              }
            />
            {referenceSummary ? (
              <CsvMetric
                label="Temporary reference"
                value={`${referenceSummary.rows} rows, ${referenceSummary.compositeDistributionCount} composites`}
              />
            ) : null}
            {csvWarnings.map((warning) => (
              <p
                className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100"
                key={warning}
              >
                {warning}
              </p>
            ))}
          </div>

          <CsvPreview dataset={csvDataset} />
        </div>
      ) : null}
    </section>
  );
}

function CsvMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/25 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function CsvPreview({ dataset }: { dataset: ParsedCsvDataset }) {
  const previewRows = dataset.rawRows.slice(0, 5);

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-300">
            CSV preview
          </h3>
          <p className="mt-1 text-xs text-slate-500">First 5 rows, expected columns.</p>
        </div>
      </div>
      <div className="mt-3 overflow-auto">
        <table className="min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr>
              {expectedCsvColumns.map((column) => (
                <th
                  className="border-b border-white/10 px-3 py-2 font-semibold uppercase tracking-[0.08em] text-slate-500"
                  key={column}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr className="border-b border-white/5" key={index}>
                {expectedCsvColumns.map((column) => (
                  <td className="px-3 py-2 text-slate-300" key={column}>
                    {row[column] || "--"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange
}: {
  field: FieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputClass =
    "mt-1 min-h-11 w-full rounded-md border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20";

  return (
    <label className="block text-sm text-slate-300">
      <span className="flex items-center justify-between gap-2">
        <span>{field.label}</span>
        {field.unit ? <span className="text-xs text-slate-500">{field.unit}</span> : null}
      </span>
      {field.type === "select" ? (
        <select
          className={inputClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={inputClass}
          inputMode={field.type === "number" ? "decimal" : undefined}
          placeholder={field.placeholder}
          step={field.step}
          type={field.type ?? "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function ScoreSummary({
  availableDomainCount,
  compositeUnavailableReason,
  result
}: {
  availableDomainCount: number;
  compositeUnavailableReason: string | null;
  result: ScoringResult | null;
}) {
  const percentile = result?.compositePercentile ?? null;

  return (
    <article className="rounded-lg border border-violet-300/20 bg-white/[0.06] p-5 shadow-glass backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">
            Cardiac composite burden score
          </p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-semibold leading-none text-white">
              {result?.compositeScore === null || result === null
                ? "--"
                : formatNumber(result.compositeScore, 2)}
            </span>
            <span className="pb-1 text-sm text-slate-400">directional z</span>
          </div>
        </div>
        <div className="rounded-md border border-violet-300/25 bg-violet-300/10 px-4 py-3 text-left lg:min-w-56">
          <p className="text-xs uppercase tracking-[0.12em] text-violet-200">
            Relative burden
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {result?.riskLabel ?? "Not calculated"}
          </p>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-300 via-amber-300 to-rose-400 transition-all"
          style={{ width: `${percentile ?? 0}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="Cardiac burden percentile"
          value={formatNullable(percentile, 1)}
        />
        <MetricTile
          label="Data completeness"
          value={
            result === null
              ? "--"
              : `${formatNumber(result.dataCompletenessPercentage, 1)}%`
          }
        />
        <MetricTile label="Available domains" value={`${availableDomainCount} / 3`} />
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-slate-950/30 p-4">
        <p className="text-sm leading-6 text-slate-200">
          {result?.interpretationText ??
            "Enter cardiac values and calculate a score against the active local reference cohort."}
        </p>
        {compositeUnavailableReason ? (
          <p className="mt-2 text-sm leading-6 text-amber-100">
            {compositeUnavailableReason}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function SignatureInterpretation({ result }: { result: ScoringResult | null }) {
  return (
    <article className="rounded-lg border border-violet-300/30 bg-gradient-to-br from-violet-400/[0.16] via-slate-950/35 to-teal-300/[0.12] p-5 shadow-glass backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-100">
        bU[-]-associated signature interpretation
      </p>
      <p className="mt-3 text-base leading-7 text-white">
        {getBuAssociatedSignatureText(result)}
      </p>
    </article>
  );
}

function DomainSummary({ result }: { result: ScoringResult | null }) {
  return (
    <article className="rounded-lg border border-white/10 bg-clinical-panel/80 p-5 shadow-glass backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Domain availability</h2>
          <p className="mt-1 text-sm text-slate-400">
            Cardiac composite burden score requires at least two computable domains.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {domainScoreKeys.map((domainKey) => {
          const display = domainDisplay[domainKey];
          const score = result?.domainScores[domainKey] ?? null;
          const availability = result?.domainAvailability[domainKey] ?? null;

          return (
            <section
              className={`rounded-lg border p-4 ${display.accent}`}
              key={domainKey}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${display.dot}`} />
                <div>
                  <h3 className="text-sm font-semibold text-white">{display.label}</h3>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {formatNullable(score, 2)}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-md bg-black/15 p-3 text-sm">
                <p className="font-medium text-slate-200">
                  {availability?.isAvailable ? "Computable" : "Insufficient"}
                </p>
                <p className="mt-1 text-slate-400">
                  {availability
                    ? `${availability.availableFeatureCount} available / ${availability.requiredFeatureCount} required`
                    : "Calculate to evaluate domain availability."}
                </p>
                {!availability?.isAvailable && availability?.reason ? (
                  <p className="mt-2 text-amber-100">{availability.reason}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function ContributorSummary({ result }: { result: ScoringResult | null }) {
  const contributors = result?.top3PositiveContributors ?? [];

  return (
    <article className="rounded-lg border border-white/10 bg-clinical-panel/80 p-5 shadow-glass backdrop-blur">
      <h2 className="text-lg font-semibold text-white">Top 3 positive contributors</h2>
      <p className="mt-1 text-sm text-slate-400">
        Cardiac features with the largest burden-direction z-scores.
      </p>

      <div className="mt-4 grid gap-3">
        {contributors.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
            {result === null
              ? "Calculate a patient score to show contributors."
              : "No positive burden contributors in the available cardiac fields."}
          </p>
        ) : (
          contributors.map((contributor, index) => (
            <div
              className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.045] p-4"
              key={contributor.feature}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Contributor {index + 1}
                </p>
                <p className="mt-1 font-semibold text-white">{contributor.label}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {formatNumber(contributor.value, 2)} {contributor.unit}
                </p>
              </div>
              <p className="text-2xl font-semibold text-amber-200">
                +{formatNumber(contributor.directionalZScore, 2)}
              </p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function CohortAssociationContext({ patient }: { patient: PatientInput | null }) {
  const hasKnownBrainContext =
    patient !== null &&
    brainContextKeys.some((field) => patient[field] !== undefined);

  return (
    <article className="rounded-lg border border-sky-300/20 bg-sky-300/[0.055] p-5 shadow-glass backdrop-blur">
      <h2 className="text-lg font-semibold text-white">Cohort association context</h2>
      <p className="mt-1 text-sm text-sky-100/75">
        Brain FDG-PET variables are not used as inputs for manual scoring. In
        the reference analysis, higher cardiac composite burden was associated
        with the bU[-] phenotype and with STG/vermis metabolic features. These
        associations are shown as cohort-level context only.
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-sky-50/90">
        <li>Outcome/context phenotype: bU[-] brain FDG-PET phenotype</li>
        <li>Main cardiac signal: kinetic impairment and remodelling/adiposity burden</li>
        <li>
          Interpretation: cardiac profile mapped onto brain metabolic phenotype
          at cohort level
        </li>
      </ul>

      {hasKnownBrainContext ? (
        <details className="mt-4 rounded-md border border-sky-200/15 bg-black/15 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-sky-100">
            Known brain phenotype context
          </summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <ContextItem label="Brain phenotype" value={patient.brain_phenotype} />
            <ContextItem label="Brain binary" value={patient.brain_binary} />
            <ContextItem label="Vermis feature" value={patient.vermis_feature} />
            <ContextItem label="STG feature" value={patient.stg_feature} />
          </dl>
        </details>
      ) : null}
    </article>
  );
}

function ContextItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border border-sky-200/10 bg-black/15 p-3">
      <dt className="text-xs uppercase tracking-[0.12em] text-sky-200/75">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-white">
        {value === undefined || value === "" ? "--" : String(value)}
      </dd>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function getBuAssociatedSignatureText(result: ScoringResult | null): string {
  const percentile = result?.compositePercentile;

  if (percentile === null || percentile === undefined) {
    return "Insufficient cardiac data to compute the bU[-]-associated cardiac signature.";
  }

  if (percentile >= 90) {
    return "Very high cardiac burden profile. In the reference cohort, higher cardiac composite burden was associated with the bU[-] brain phenotype. This patient's cardiac profile strongly resembles the bU[-]-associated cardiac signature.";
  }

  if (percentile >= 75) {
    return "High cardiac burden profile. In the reference cohort, higher cardiac composite burden was associated with the bU[-] brain phenotype. This patient's cardiac profile moderately-to-strongly resembles the bU[-]-associated cardiac signature.";
  }

  if (percentile >= 50) {
    return "Moderate cardiac burden profile. This pattern should be interpreted as exploratory and cohort-relative.";
  }

  return "Low cardiac burden profile within the reference cohort.";
}

function patientToFormValues(patient: PatientInput): Record<FormField, string> {
  const nextValues = { ...emptyFormValues };

  for (const key of Object.keys(nextValues) as FormField[]) {
    const value = patient[key];
    nextValues[key] = value === undefined ? "" : String(value);
  }

  return nextValues;
}

function parsePatientInput(values: Record<FormField, string>): PatientInput {
  const patient: ManualPatientInput = {};

  for (const [key, value] of Object.entries(values) as Array<[FormField, string]>) {
    const trimmedValue = value.trim();
    if (trimmedValue === "") {
      continue;
    }

    if (numericFields.has(key)) {
      const numericValue = Number(trimmedValue);
      if (Number.isFinite(numericValue)) {
        assignPatientValue(patient, key, numericValue);
      }
    } else {
      assignPatientValue(patient, key, trimmedValue);
    }
  }

  return patient;
}

function assignPatientValue<K extends FormField>(
  patient: ManualPatientInput,
  key: K,
  value: ManualPatientInput[K]
): void {
  patient[key] = value;
}

function buildCompositeUnavailableReason(result: ScoringResult): string {
  const availableDomains = domainScoreKeys.filter(
    (domainKey) => result.domainScores[domainKey] !== null
  ).length;
  const insufficientDomains = domainScoreKeys
    .filter((domainKey) => result.domainScores[domainKey] === null)
    .map((domainKey) => {
      const availability = result.domainAvailability[domainKey];
      const missingLabels = availability.missingFeatures
        .map((feature: ScoredFeatureKey) => bundledReferenceStats.features[feature].label)
        .join(", ");

      return `${domainDisplay[domainKey].label}: ${availability.reason}${
        missingLabels ? ` Missing ${missingLabels}.` : ""
      }`;
    });

  return `Cardiac composite burden score cannot be computed because ${availableDomains} of 3 domains are available; at least 2 are required. ${insufficientDomains.join(" ")}`;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const savedTheme = window.localStorage.getItem("cbcb-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch {
    // Ignore storage failures and fall back to the browser preference.
  }

  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function formatNullable(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined ? "--" : formatNumber(value, digits);
}

function formatNumber(value: number, digits: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}
