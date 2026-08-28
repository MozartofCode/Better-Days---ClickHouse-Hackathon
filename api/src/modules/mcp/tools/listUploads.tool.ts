import * as uploadsService from "../../uploads/uploads.service";
import { defineTool, jsonResult } from "./types";

export const listUploadsTool = defineTool({
  name: "list_uploads",
  description: "List spreadsheet uploads for your food bank, most recent first.",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const uploads = await uploadsService.listUploads(ctx.user.foodBankId);
    return jsonResult(uploads);
  },
});
