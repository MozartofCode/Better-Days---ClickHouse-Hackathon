import { pgPool } from "../../db/postgres";
import { HttpError } from "../../utils/http-error";
import * as dashboardService from "../dashboard/dashboard.service";
import * as uploadsService from "../uploads/uploads.service";

export async function listFoodBanks() {
  const result = await pgPool.query("SELECT id, name FROM food_banks ORDER BY name ASC");
  return result.rows;
}

export async function findFoodBankByName(name: string): Promise<{ id: string; name: string }> {
  const result = await pgPool.query("SELECT id, name FROM food_banks WHERE name = $1", [name]);
  if (result.rows.length === 0) {
    throw new HttpError(404, `No food bank found with name "${name}"`);
  }
  return result.rows[0];
}

export async function getDashboardSummary(foodBankName: string) {
  const foodBank = await findFoodBankByName(foodBankName);
  return dashboardService.getSummary(foodBank.id);
}

export async function listUploads(foodBankName: string) {
  const foodBank = await findFoodBankByName(foodBankName);
  return uploadsService.listUploads(foodBank.id);
}

export async function getUploadRows(
  foodBankName: string,
  uploadId: string,
  page: number,
  pageSize: number
) {
  const foodBank = await findFoodBankByName(foodBankName);
  return dashboardService.getUploadRows(foodBank.id, uploadId, page, pageSize);
}
