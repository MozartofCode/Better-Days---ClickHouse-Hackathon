// Tool registry: every *.tool.ts file in this directory defines one tool via
// defineTool(...) and is imported here. To add a new MCP tool later:
//   1. Create a new file, e.g. myNewThing.tool.ts, calling defineTool({...}).
//   2. Import it below and add it to `allTools`.
// No other file needs to change — mcp.server.ts registers whatever is here.
import { McpToolDefinition } from "./types";
import { getDashboardSummaryTool } from "./getDashboardSummary.tool";
import { listUploadsTool } from "./listUploads.tool";
import { getUploadRowsTool } from "./getUploadRows.tool";
import { getFoodBankProfileTool } from "./getFoodBankProfile.tool";
import { listSitesTool } from "./listSites.tool";
import { listProgramsTool } from "./listPrograms.tool";
import { listItemsTool } from "./listItems.tool";
import { updateItemTool } from "./updateItem.tool";
import { correctUploadRowTool } from "./correctUploadRow.tool";
import { updateFoodBankProfileTool } from "./updateFoodBankProfile.tool";

export const allTools: McpToolDefinition<any>[] = [
  // Read
  getDashboardSummaryTool,
  listUploadsTool,
  getUploadRowsTool,
  getFoodBankProfileTool,
  listSitesTool,
  listProgramsTool,
  listItemsTool,
  // Write
  updateItemTool,
  correctUploadRowTool,
  updateFoodBankProfileTool,
];
