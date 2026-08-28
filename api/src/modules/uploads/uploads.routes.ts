import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { uploadHandler, listUploadsHandler } from "./uploads.controller";

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

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);
uploadsRouter.post("/", upload.single("file"), uploadHandler);
uploadsRouter.get("/", listUploadsHandler);
