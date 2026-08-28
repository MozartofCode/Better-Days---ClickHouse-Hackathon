import { z } from "zod";
import * as dashboardService from "../../dashboard/dashboard.service";
import { defineTool, jsonResult } from "./types";

export const correctUploadRowTool = defineTool({
  name: "correct_upload_row",
  description: "Correct specific fields of one row in one of your food bank's uploads (e.g. fix a typo'd quantity or item name). Only the fields you pass are changed. Note: this queues a ClickHouse mutation — the correction is not necessarily visible immediately.",
  mode: "write",
  inputSchema: {
    uploadId: z.string().uuid(),
    rowNumber: z.coerce.number().int().min(1),
    fields: z.record(z.string(), z.string()).describe("Map of column name -> corrected value"),
  },
  async handler(args, ctx) {
    const result = await dashboardService.correctUploadRow(ctx.user.foodBankId, args.uploadId, args.rowNumber, args.fields);
    return jsonResult(result);
  },
});
