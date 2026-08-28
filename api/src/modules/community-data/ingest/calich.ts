import { pgPool } from "../../../db/postgres";
import { fetchAllRecords } from "./ckanClient";
import { withIngestionRun, IngestionRunResult } from "./ingestionRun";

const CA_DATA_PORTAL = "https://data.ca.gov";

// data.ca.gov/dataset/homelessness-demographics — same row shape across all
// three resources (CALENDAR_YEAR, LOCATION_ID, <dimension>, ..._CNT), just a
// different dimension per resource.
const HOMELESSNESS_DEMOGRAPHICS_RESOURCES: Array<{
  resourceId: string;
  dimensionType: "gender" | "race" | "age";
  dimensionField: string;
  countField: string;
}> = [
  {
    resourceId: "57142555-f2da-462f-a999-d44abf0af69c",
    dimensionType: "gender",
    dimensionField: "GENDER",
    countField: "EXPERIENCING_HOMELESSNESS_CNT",
  },
  {
    resourceId: "b7ce1242-0e33-44c8-b561-4c34c5e78312",
    dimensionType: "race",
    dimensionField: "RACE_ETHNICITY",
    countField: "CNT",
  },
  {
    resourceId: "b1a5ae24-5842-425c-b56c-aa90f8f1c767",
    dimensionType: "age",
    dimensionField: "AGE_GROUP_PUBLIC",
    countField: "EXPERIENCING_HOMELESSNESS_CNT",
  },
];

// data.ca.gov/dataset/ca-system-performance-measures-statewide-and-by-coc
const SPM_RESOURCE_ID = "e02178d9-1d34-4798-9979-f50af9f1742e";

async function ingestHomelessnessDemographics(): Promise<number> {
  let total = 0;
  for (const resource of HOMELESSNESS_DEMOGRAPHICS_RESOURCES) {
    const records = await fetchAllRecords(CA_DATA_PORTAL, resource.resourceId);
    for (const record of records) {
      await pgPool.query(
        `INSERT INTO ca_homelessness_counts
           (calendar_year, location_id, dimension_type, dimension_value, count_raw, source_resource_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record["CALENDAR_YEAR"],
          record["LOCATION_ID"],
          resource.dimensionType,
          record[resource.dimensionField],
          record[resource.countField],
          resource.resourceId,
        ]
      );
      total += 1;
    }
  }
  return total;
}

async function ingestSystemPerformanceMeasures(): Promise<number> {
  const records = await fetchAllRecords(CA_DATA_PORTAL, SPM_RESOURCE_ID);
  for (const record of records) {
    // Wide format: one row per (Location, Metric), with one column per
    // reporting period (e.g. "Jan 2024 - Dec 2024"). Keep the full row as
    // `raw` and index only Location/Metric; period-level values are read
    // straight out of `raw` by consumers.
    const cocOrState = (record["Location"] as string | undefined) ?? null;
    const metric = (record["Metric"] as string | undefined) ?? null;

    await pgPool.query(
      `INSERT INTO ca_system_performance_measures
         (coc_or_state, metric, raw, source_resource_id)
       VALUES ($1, $2, $3, $4)`,
      [cocOrState, metric, JSON.stringify(record), SPM_RESOURCE_ID]
    );
  }
  return records.length;
}

export async function ingestCalich(): Promise<IngestionRunResult[]> {
  const demographics = await withIngestionRun(
    "calich_homelessness_demographics",
    ingestHomelessnessDemographics
  );
  const spm = await withIngestionRun(
    "calich_system_performance_measures",
    ingestSystemPerformanceMeasures
  );
  return [demographics, spm];
}
