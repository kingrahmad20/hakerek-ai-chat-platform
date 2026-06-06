import { parseDocument } from "@/lib/rag";

// Google Drive REST adapter. Uses the v3 API over plain fetch (consistent with
// the rest of this codebase — no googleapis SDK dependency). Lists files in a
// folder (or the whole Drive), and extracts plain text from each, either by
// exporting native Google formats or by downloading binaries and running them
// through the existing document parser.

const DRIVE_API = "https://www.googleapis.com/drive/v3";

// Safety caps so a huge Drive can't blow up a single sync pass.
const MAX_FILES = 500;
const PAGE_SIZE = 100;
// Drive's export endpoint refuses files whose export would exceed 10 MB.
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// Native Google formats can't be downloaded directly; they must be *exported*
// to a concrete mime type. Map each to the export format we feed into RAG.
const GOOGLE_EXPORT: Record<string, { mimeType: string; ext: string }> = {
    "application/vnd.google-apps.document": { mimeType: "text/plain", ext: ".txt" },
    "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", ext: ".csv" },
    "application/vnd.google-apps.presentation": { mimeType: "text/plain", ext: ".txt" },
};

// Binary/uploaded mime types we can extract text from (mirrors the upload route's
// allow-list). Anything else (images, video, archives, …) is skipped.
const SUPPORTED_BINARY = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/rtf",
    "text/rtf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
]);

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    md5Checksum?: string;
    size?: string;
    webViewLink?: string;
}

export function isSyncableDriveFile(mimeType: string): boolean {
    return mimeType in GOOGLE_EXPORT || SUPPORTED_BINARY.has(mimeType);
}

// A change fingerprint: binaries expose an md5; native Google docs don't, so we
// fall back to their last-modified timestamp. Either way, a changed value means
// "re-index", an unchanged one means "skip".
export function fingerprintOf(file: DriveFile): string {
    return file.md5Checksum || file.modifiedTime;
}

async function driveFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
    return fetch(`${DRIVE_API}${path}`, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(60_000),
    });
}

// Lists non-trashed files. When folderId is set, only that folder's direct
// children; otherwise every file in the user's Drive (capped at MAX_FILES).
export async function listDriveFiles(accessToken: string, folderId: string | null): Promise<DriveFile[]> {
    const clauses = ["trashed = false", "mimeType != 'application/vnd.google-apps.folder'"];
    if (folderId) clauses.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);
    const q = clauses.join(" and ");

    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
        const params = new URLSearchParams({
            q,
            fields: "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, webViewLink)",
            pageSize: String(PAGE_SIZE),
            orderBy: "modifiedTime desc",
        });
        if (pageToken) params.set("pageToken", pageToken);

        const resp = await driveFetch(`/files?${params.toString()}`, accessToken);
        if (!resp.ok) {
            throw new Error(`Drive list ${resp.status}: ${await resp.text().catch(() => "")}`);
        }
        const data = (await resp.json()) as { files?: DriveFile[]; nextPageToken?: string };
        for (const f of data.files ?? []) {
            if (isSyncableDriveFile(f.mimeType)) files.push(f);
            if (files.length >= MAX_FILES) return files;
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return files;
}

// Lists folders the connected account can see, for the folder-picker UI.
export async function listDriveFolders(accessToken: string): Promise<{ id: string; name: string }[]> {
    const params = new URLSearchParams({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)",
        pageSize: "200",
        orderBy: "name",
    });
    const resp = await driveFetch(`/files?${params.toString()}`, accessToken);
    if (!resp.ok) {
        throw new Error(`Drive folder list ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const data = (await resp.json()) as { files?: { id: string; name: string }[] };
    return data.files ?? [];
}

export interface ExtractedContent {
    text: string;
    fileType: string;
}

// Pulls a file's text content. Native Google formats are exported to text/CSV;
// supported binaries are downloaded and run through the shared parser.
export async function extractDriveFileText(accessToken: string, file: DriveFile): Promise<ExtractedContent> {
    const exportFmt = GOOGLE_EXPORT[file.mimeType];
    if (exportFmt) {
        const params = new URLSearchParams({ mimeType: exportFmt.mimeType });
        const resp = await driveFetch(`/files/${file.id}/export?${params.toString()}`, accessToken);
        if (!resp.ok) {
            throw new Error(`Drive export ${resp.status}: ${await resp.text().catch(() => "")}`);
        }
        return { text: await resp.text(), fileType: exportFmt.mimeType };
    }

    if (!SUPPORTED_BINARY.has(file.mimeType)) {
        throw new Error(`Unsupported Drive mime type: ${file.mimeType}`);
    }
    if (file.size && Number(file.size) > MAX_DOWNLOAD_BYTES) {
        throw new Error(`File too large to sync (${file.size} bytes)`);
    }

    const resp = await driveFetch(`/files/${file.id}?alt=media`, accessToken);
    if (!resp.ok) {
        throw new Error(`Drive download ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const text = await parseDocument(buffer, file.mimeType);
    return { text, fileType: file.mimeType };
}
