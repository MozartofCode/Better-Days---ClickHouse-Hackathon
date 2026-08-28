import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import {
  ingestFileHandler,
  ingestJsonHandler,
  listUploadsHandler,
  uploadRecordsHandler,
  suggestedQuestionsHandler,
  askHandler,
  suggestedAskHandler,
} from "./demand.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, or .csv files are allowed"));
    }
  },
});

export const demandRouter = Router();

demandRouter.use(requireAuth);
demandRouter.post("/ingest", upload.single("file"), ingestFileHandler);
demandRouter.post("/ingest-json", ingestJsonHandler);
demandRouter.get("/uploads", listUploadsHandler);
demandRouter.get("/uploads/:id/records", uploadRecordsHandler);
demandRouter.get("/suggested-questions", suggestedQuestionsHandler);
demandRouter.post("/ask", askHandler);
demandRouter.post("/ask/:metric", suggestedAskHandler);
