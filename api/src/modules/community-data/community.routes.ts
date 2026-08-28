import { Router } from "express";
import { requireServiceKey } from "../../middleware/serviceAuth";
import {
  demandProxyCountiesHandler,
  demandProxyCountyDetailHandler,
  searchFoodBanksHandler,
  foodBankDetailsHandler,
  ingestHandler,
} from "./community.controller";

export const communityRouter = Router();

// Public, read-only reference data.
communityRouter.get("/demand-proxy/counties", demandProxyCountiesHandler);
communityRouter.get("/demand-proxy/counties/:county", demandProxyCountyDetailHandler);
communityRouter.get("/food-banks", searchFoodBanksHandler);
communityRouter.get("/food-banks/:slug", foodBankDetailsHandler);

// Mutating/costly — gated behind the same shared service key used for
// LibreChat actions, so re-ingestion can't be triggered publicly.
communityRouter.post("/ingest/:source", requireServiceKey, ingestHandler);
