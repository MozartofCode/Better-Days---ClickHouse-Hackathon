import { pgPool } from "../../../db/postgres";
import { fetchAllRecords } from "./ckanClient";
import { withIngestionRun, IngestionRunResult } from "./ingestionRun";

const CHHS_DATA_PORTAL = "https://data.chhs.ca.gov";

// data.chhs.ca.gov/dataset/bh-county-profile — homelessness resource
const BH_COUNTY_PROFILE_HOMELESSNESS_RESOURCE_ID =
  "39b4a109-39e0-4a39-9940-6ae0d3349444";

async function ingest(): Promise<number> {
  const records = await fetchAllRecords(
    CHHS_DATA_PORTAL,
    BH_COUNTY_PROFILE_HOMELESSNESS_RESOURCE_ID
  );

  for (const record of records) {
    await pgPool.query(
      `INSERT INTO chhs_bh_county_profile
         (county_name, data_type, dimension, dimension_dtl, value_raw,
          annotation_code, annotation_desc, source_resource_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record["COUNTY_NAME"],
        record["DATA_TYPE"],
        record["DIMENSION"],
        record["DIMENSION_DTL"],
        record["VALUE"],
        record["ANNOTATION_CODE"],
        record["ANNOTATION_DESC"],
        BH_COUNTY_PROFILE_HOMELESSNESS_RESOURCE_ID,
      ]
    );
  }

  return records.length;
}

export async function ingestChhsBhCountyProfile(): Promise<IngestionRunResult> {
  return withIngestionRun("chhs_bh_county_profile", ingest);
}
