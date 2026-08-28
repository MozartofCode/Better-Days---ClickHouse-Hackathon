// Generic client for the CKAN `datastore_search` API. Both data.ca.gov (CalICH)
// and data.chhs.ca.gov (CHHS) run the same CKAN stack, so one paginator covers
// every resource we pull from either portal.

const PAGE_SIZE = 1000;

export interface CkanRecord {
  [field: string]: string | number | null;
}

export async function fetchAllRecords(
  portalBaseUrl: string,
  resourceId: string
): Promise<CkanRecord[]> {
  const records: CkanRecord[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${portalBaseUrl}/api/3/action/datastore_search`);
    url.searchParams.set("resource_id", resourceId);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(
        `CKAN datastore_search failed for ${resourceId} at offset ${offset}: ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json()) as {
      success: boolean;
      result: { records?: CkanRecord[] };
    };
    if (!body.success) {
      throw new Error(`CKAN datastore_search returned success=false for ${resourceId}`);
    }

    const page: CkanRecord[] = body.result.records ?? [];
    records.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return records;
}
