import { Router } from "express";
import {
  searchFoodBanksByZip,
  searchFoodBanksByState,
  getFoodBankDetails,
  upsertFoodBank,
} from "../../ingest/feedingAmerica";

export const foodBanksRouter = Router();

// GET /api/food-banks?zip=94110  or  ?state=CA
// Always hits the live Feeding America API (per the "real-time" requirement)
// and upserts results into Postgres as a cache/audit trail — Postgres is not
// the source of truth here.
foodBanksRouter.get("/food-banks", async (req, res) => {
  const { zip, state } = req.query;

  try {
    if (typeof zip === "string") {
      const results = await searchFoodBanksByZip(zip);
      res.json(results);
      return;
    }
    if (typeof state === "string") {
      const results = await searchFoodBanksByState(state);
      res.json(results);
      return;
    }
    res.status(400).json({ error: "Provide either ?zip= or ?state=" });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/food-banks/:slug   e.g. /api/food-banks/greater-chicago-food-depository
foodBanksRouter.get("/food-banks/:slug", async (req, res) => {
  try {
    const details = await getFoodBankDetails(req.params.slug);
    await upsertFoodBank(details);
    res.json(details);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
