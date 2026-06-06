import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
    buildFeedbackRecords,
    datasetStats,
    serializeDataset,
    DATASET_FORMATS,
    LABEL_FILTERS,
    type DatasetFormat,
    type LabelFilter,
} from "@/lib/feedback-dataset";

export const dynamic = "force-dynamic";

// GET — export the thumbs-up / thumbs-down feedback loop as a dataset for evals
// or fine-tuning. With `?stats=1` it returns the available counts as JSON so the
// UI can preview the export; otherwise it streams a downloadable file.
//
//   format = sft | dpo | eval | csv   (default sft)
//   label  = good | bad | all         (default good — ignored for dpo)
//   range  = days to look back        (default 0 = all time)
//   limit  = max records to scan      (default 5000)
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const formatParam = sp.get("format") ?? "sft";
    const format: DatasetFormat = (DATASET_FORMATS as string[]).includes(formatParam)
        ? (formatParam as DatasetFormat)
        : "sft";
    const labelParam = sp.get("label") ?? "good";
    const label: LabelFilter = (LABEL_FILTERS as string[]).includes(labelParam)
        ? (labelParam as LabelFilter)
        : "good";
    const range = Math.max(0, parseInt(sp.get("range") ?? "0") || 0);
    const limit = Math.min(20000, Math.max(1, parseInt(sp.get("limit") ?? "5000") || 5000));

    const records = await buildFeedbackRecords({ rangeDays: range, limit });

    if (sp.get("stats") === "1") {
        return NextResponse.json(datasetStats(records));
    }

    const { body, contentType, extension } = serializeDataset(records, format, label);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `feedback-${format}-${date}.${extension}`;

    await logAudit(session.user.id, "EXPORT_FEEDBACK_DATASET", {
        targetType: "feedback_dataset",
        targetLabel: filename,
        metadata: { format, label, range, records: records.length },
    });

    return new NextResponse(body, {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}
