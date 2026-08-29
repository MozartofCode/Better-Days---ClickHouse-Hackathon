import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getOperationsDashboard } from "./dashboardData.service";
import { listActiveExceptions, updateException } from "./exceptionsPersistence.service";
import {
  listDistributionEvents,
  createDistributionEvent,
  listInventoryTransactions,
  createInventoryTransaction,
  listVolunteerShifts,
  createVolunteerShift,
  listDataSources,
} from "./operations.service";
import {
  buildDistributionReadinessBriefFromLiveData,
  buildMonthlyOperationsReconciliationFromLiveData,
} from "./reportData.service";
import { generateReport } from "./reports/generateReport";
import {
  recordGeneratedReport,
  listGeneratedReports,
  getGeneratedReportForDownload,
} from "./reportsPersistence.service";
import { HttpError } from "../../utils/http-error";

export async function dashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getOperationsDashboard(req.user!.foodBankId);
    res.status(200).json(dashboard);
  } catch (err) {
    next(err);
  }
}

export async function listExceptionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const exceptions = await listActiveExceptions(req.user!.foodBankId);
    res.status(200).json(exceptions);
  } catch (err) {
    next(err);
  }
}

export async function updateExceptionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, assignedOwner, resolutionNote } = req.body ?? {};
    if (!["assign", "resolve", "not_applicable"].includes(action)) {
      throw new HttpError(400, "action must be one of: assign, resolve, not_applicable");
    }
    const result = await updateException(req.user!.foodBankId, req.params.id, {
      action,
      assignedOwner,
      resolutionNote,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

const SUPPORTED_TEMPLATES = new Set(["distribution_readiness_brief", "monthly_operations_reconciliation"]);

export async function generateReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const templateId = req.params.templateId;
    if (!SUPPORTED_TEMPLATES.has(templateId)) {
      throw new HttpError(
        404,
        `Template "${templateId}" is not implemented yet. Supported: ${[...SUPPORTED_TEMPLATES].join(", ")}`
      );
    }

    const foodBankId = req.user!.foodBankId;
    const forceIncomplete = req.body?.forceIncomplete === true;
    const periodStart = req.body?.periodStart ?? new Date().toISOString().slice(0, 10);
    const periodEnd = req.body?.periodEnd ?? periodStart;
    const reportId = randomUUID();

    const report =
      templateId === "distribution_readiness_brief"
        ? await buildDistributionReadinessBriefFromLiveData(foodBankId, reportId, 1)
        : await buildMonthlyOperationsReconciliationFromLiveData(foodBankId, reportId, 1, periodStart, periodEnd);

    const result = await generateReport(report, { periodStart, periodEnd, forceIncomplete });

    if (result.status === "blocked") {
      // 200, not 422/4xx: this is a well-formed, expected outcome (the data
      // genuinely doesn't support the report yet), not a request error — the
      // frontend's request() helper throws on any non-2xx status, which
      // would make the "here's what's missing, generate an incomplete draft
      // anyway?" UI unreachable if this were an error status.
      res.status(200).json({
        status: "blocked",
        message: "Report has blocking data-quality issues and was not generated. Pass forceIncomplete:true for a watermarked incomplete draft.",
        dataQuality: result.report.dataQuality,
      });
      return;
    }

    const recorded = await recordGeneratedReport({
      foodBankId,
      report: result.report,
      periodStart,
      periodEnd,
      filename: result.filename as string,
      filePath: result.filePath as string,
      blocked: result.report.dataQuality.hasBlockingIssues,
      generatedByUserId: req.user!.id,
    });

    res.status(201).json({
      status: "generated",
      report: recorded,
      dataQuality: result.report.dataQuality,
      downloadUrl: `/api/operations/reports/${recorded.reportId}/download`,
    });
  } catch (err) {
    next(err);
  }
}

export async function listReportsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const reports = await listGeneratedReports(req.user!.foodBankId);
    res.status(200).json(reports);
  } catch (err) {
    next(err);
  }
}

export async function downloadReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await getGeneratedReportForDownload(req.user!.foodBankId, req.params.id);
    if (!fs.existsSync(record.filePath)) {
      throw new HttpError(404, "Report file no longer exists on disk");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(record.filename)}"`);
    fs.createReadStream(record.filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function listDistributionEventsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const events = await listDistributionEvents(req.user!.foodBankId);
    res.status(200).json(events);
  } catch (err) {
    next(err);
  }
}

export async function createDistributionEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const event = await createDistributionEvent(req.user!.foodBankId, req.body ?? {});
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
}

export async function listInventoryTransactionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const transactions = await listInventoryTransactions(req.user!.foodBankId);
    res.status(200).json(transactions);
  } catch (err) {
    next(err);
  }
}

export async function createInventoryTransactionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await createInventoryTransaction(req.user!.foodBankId, req.user!.id, req.body ?? {});
    res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
}

export async function listVolunteerShiftsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const shifts = await listVolunteerShifts(req.user!.foodBankId);
    res.status(200).json(shifts);
  } catch (err) {
    next(err);
  }
}

export async function createVolunteerShiftHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const shift = await createVolunteerShift(req.user!.foodBankId, req.body ?? {});
    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
}

export async function listDataSourcesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const sources = await listDataSources(req.user!.foodBankId);
    res.status(200).json(sources);
  } catch (err) {
    next(err);
  }
}
