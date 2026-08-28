import * as dashboardService from "../../dashboard/dashboard.service";
import { defineTool, jsonResult } from "./types";

export const getDashboardSummaryTool = defineTool({
  name: "get_dashboard_summary",
  description: "Get the current inventory dashboard summary for your food bank: upload counts, current inventory snapshot, expiring/expired/low-stock/out-of-stock items, and category breakdowns.",
  mode: "read",
  inputSchema: {},
  async handler(_args, ctx) {
    const summary = await dashboardService.getSummary(ctx.user.foodBankId);
    return jsonResult(summary);
  },
});
