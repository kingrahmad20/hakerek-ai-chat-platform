/**
 * Minimal standard cron (5-field) parser and next-run calculator with IANA
 * timezone support. No external dependency — the only platform feature used is
 * `Intl.DateTimeFormat` for timezone conversion.
 *
 * Fields, in order: minute hour day-of-month month day-of-week
 *   minute       0-59
 *   hour         0-23
 *   day-of-month 1-31
 *   month        1-12
 *   day-of-week  0-6  (0 = Sunday)
 *
 * Each field supports: `*`, a single value, comma lists (`a,b`), ranges
 * (`a-b`), and steps (`* /n` or `a-b/n`). This is deliberately a practical
 * subset — enough for the UI presets (hourly/daily/weekly/monthly) and most
 * hand-written expressions — not a full Vixie-cron implementation.
 */

interface CronField {
    /** Sorted, de-duplicated set of allowed values for this field. */
    values: Set<number>;
    /** True when the source token was a bare `*` (used for dom/dow OR semantics). */
    wildcard: boolean;
}

export interface ParsedCron {
    minute: CronField;
    hour: CronField;
    dom: CronField;
    month: CronField;
    dow: CronField;
}

const FIELD_RANGES: [number, number][] = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 6], // day of week
];

function parseField(token: string, min: number, max: number): CronField {
    const wildcard = token === "*" || token === "*/1";
    const values = new Set<number>();

    for (const part of token.split(",")) {
        const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
        if (!stepMatch) throw new Error(`Invalid cron field: "${token}"`);

        const [, rangePart, stepStr] = stepMatch;
        const step = stepStr ? parseInt(stepStr, 10) : 1;
        if (step < 1) throw new Error(`Invalid step in cron field: "${token}"`);

        let lo: number;
        let hi: number;
        if (rangePart === "*") {
            lo = min;
            hi = max;
        } else if (rangePart.includes("-")) {
            const [a, b] = rangePart.split("-").map((n) => parseInt(n, 10));
            lo = a;
            hi = b;
        } else {
            lo = hi = parseInt(rangePart, 10);
        }

        if (lo < min || hi > max || lo > hi || Number.isNaN(lo) || Number.isNaN(hi)) {
            throw new Error(`Cron value out of range in "${token}" (expected ${min}-${max})`);
        }

        for (let v = lo; v <= hi; v += step) values.add(v);
    }

    if (values.size === 0) throw new Error(`Empty cron field: "${token}"`);
    return { values, wildcard };
}

export function parseCron(expr: string): ParsedCron {
    const tokens = expr.trim().split(/\s+/);
    if (tokens.length !== 5) {
        throw new Error("Cron expression must have exactly 5 fields (min hour dom month dow)");
    }
    const [minute, hour, dom, month, dow] = tokens.map((tok, i) =>
        parseField(tok, FIELD_RANGES[i][0], FIELD_RANGES[i][1])
    );
    // Normalise dow=7 → 0 already handled by range (max 6); accept Sunday only as 0.
    return { minute, hour, dom, month, dow };
}

export function isValidCron(expr: string): boolean {
    try {
        parseCron(expr);
        return true;
    } catch {
        return false;
    }
}

/** Wall-clock components in a specific timezone. */
interface Wall {
    year: number;
    month: number; // 1-12
    day: number; // 1-31
    hour: number; // 0-23
    minute: number; // 0-59
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
    let f = partsCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsCache.set(tz, f);
    }
    return f;
}

/** Convert a real UTC instant into its wall-clock components in `tz`. */
function toWall(date: Date, tz: string): Wall {
    const parts = formatter(tz).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    let hour = get("hour");
    if (hour === 24) hour = 0; // some engines emit 24 for midnight
    return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/** Offset (localWallClock - utc) in ms for `tz` at the given instant. */
function tzOffsetMs(date: Date, tz: string): number {
    const w = toWall(date, tz);
    const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0);
    // Round `date` down to the minute so the diff is a clean offset.
    const flooredUtc = Math.floor(date.getTime() / 60000) * 60000;
    return asUTC - flooredUtc;
}

/** Convert wall-clock components (interpreted in `tz`) to a real UTC instant. */
function wallToUtc(w: Wall, tz: string): Date {
    const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0);
    // First approximation using the offset at the guessed instant…
    let offset = tzOffsetMs(new Date(guess), tz);
    let utc = guess - offset;
    // …then refine once to settle DST boundaries.
    offset = tzOffsetMs(new Date(utc), tz);
    utc = guess - offset;
    return new Date(utc);
}

function dayOfWeek(w: Wall): number {
    // Use a UTC date built from the wall components; getUTCDay is tz-independent here.
    return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

function matches(parsed: ParsedCron, w: Wall): boolean {
    if (!parsed.minute.values.has(w.minute)) return false;
    if (!parsed.hour.values.has(w.hour)) return false;
    if (!parsed.month.values.has(w.month)) return false;

    // Standard cron semantics: when both dom and dow are restricted (neither is
    // a bare `*`), a match on *either* qualifies. Otherwise both must match.
    const domOk = parsed.dom.values.has(w.day);
    const dowOk = parsed.dow.values.has(dayOfWeek(w));
    if (parsed.dom.wildcard || parsed.dow.wildcard) {
        return domOk && dowOk;
    }
    return domOk || dowOk;
}

function addMinute(w: Wall): Wall {
    // Walk wall-clock minutes forward using a UTC proxy date for the arithmetic.
    const proxy = new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0) + 60000);
    return {
        year: proxy.getUTCFullYear(),
        month: proxy.getUTCMonth() + 1,
        day: proxy.getUTCDate(),
        hour: proxy.getUTCHours(),
        minute: proxy.getUTCMinutes(),
    };
}

// Upper bound on the forward search: ~13 months of minutes. Comfortably covers
// hourly/daily/weekly/monthly schedules; pathological ones (e.g. Feb-29-only)
// fall back to null rather than spinning.
const MAX_SEARCH_MINUTES = 60 * 24 * 400;

/**
 * Compute the next instant (UTC) at or after `after` that matches `expr`,
 * evaluated in `timezone`. Returns null if the expression is invalid or no
 * match is found within the search window.
 */
export function getNextRun(expr: string, timezone: string, after: Date = new Date()): Date | null {
    let parsed: ParsedCron;
    try {
        parsed = parseCron(expr);
    } catch {
        return null;
    }

    const tz = timezone || "UTC";
    // Start from the next whole minute in the target timezone.
    let w = toWall(new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000), tz);

    for (let i = 0; i < MAX_SEARCH_MINUTES; i++) {
        if (matches(parsed, w)) {
            return wallToUtc(w, tz);
        }
        w = addMinute(w);
    }
    return null;
}

/** Human-readable summary of a cron expression for display. Best-effort. */
export function describeCron(expr: string): string {
    if (!isValidCron(expr)) return "Invalid schedule";
    const [min, hour, dom, , dow] = expr.trim().split(/\s+/);
    const at = (h: string, m: string) => {
        const hh = h.padStart(2, "0");
        const mm = m.padStart(2, "0");
        return `${hh}:${mm}`;
    };
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    if (min === "*" ) return "Every minute";
    if (hour === "*" && dom === "*" && dow === "*") return `Hourly at :${min.padStart(2, "0")}`;
    if (dom === "*" && dow === "*") return `Daily at ${at(hour, min)}`;
    if (dom === "*" && dow !== "*") {
        const names = dow.split(",").map((d) => days[Number(d)] ?? d).join(", ");
        return `Weekly on ${names} at ${at(hour, min)}`;
    }
    if (dom !== "*") return `Monthly on day ${dom} at ${at(hour, min)}`;
    return expr;
}
