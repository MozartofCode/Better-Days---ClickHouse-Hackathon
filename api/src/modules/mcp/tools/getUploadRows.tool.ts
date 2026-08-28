import { z } from "zod";
import * as dashboardService from "../../dashboard/dashboard.service";
import { defineTool, jsonResult } from "./types";

export const getUploadRowsTool = defineTool({
  name: "get_upload_rows",
  description: "Get the row-level data for one of your food bank's uploads, paginated.",
  mode: "read",
  inputSchema: {
    uploadId: z.string().uuid().describe("The upload's ID (see list_uploads)"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  },
  async handler(args, ctx) {
    const result = await dashboardService.getUploadRows(ctx.user.foodBankId, args.uploadId, args.page, args.pageSize);
    return jsonResult(result);
  },
});
