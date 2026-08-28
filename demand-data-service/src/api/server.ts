import express from "express";
import { env } from "../config/env";
import { healthRouter } from "./routes/health";
import { demandProxyRouter } from "./routes/demandProxy";
import { foodBanksRouter } from "./routes/foodBanks";
import { ingestRouter } from "./routes/ingest";

const app = express();
app.use(express.json());

app.use("/api", healthRouter);
app.use("/api", demandProxyRouter);
app.use("/api", foodBanksRouter);
app.use("/api", ingestRouter);

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
