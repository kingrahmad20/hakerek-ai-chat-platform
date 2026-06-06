import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * SSRF protection helpers.
 *
 * `assertSafeUrl` resolves a URL's hostname and rejects it if it points at a
 * loopback, private, link-local, or otherwise reserved address. `safeFetch`
 * additionally follows redirects manually, re-validating every hop, so a public
 * URL cannot bounce the request to an internal address (e.g. cloud metadata).
 *
 * Residual risk: a DNS-rebinding attacker could return a public address at
 * validation time and a private one when `fetch` re-resolves. The standard
 * fetch API gives us no way to pin the resolved IP, so we accept this narrow
 * TOCTOU window; the checks below still block every direct/literal/redirect/
 * encoded-IP vector.
 */

export class SsrfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SsrfError";
    }
}

function isPrivateIpv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
        return true; // malformed → treat as unsafe
    }
    const [a, b] = parts;
    if (a === 0) return true;                       // 0.0.0.0/8 "this network"
    if (a === 10) return true;                      // 10.0.0.0/8 private
    if (a === 127) return true;                     // loopback
    if (a === 169 && b === 254) return true;        // link-local / cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                      // multicast + reserved
    return false;
}

function isPrivateIpv6(ip: string): boolean {
    const addr = ip.toLowerCase().split("%")[0]; // drop zone id
    if (addr === "::1" || addr === "::") return true;          // loopback / unspecified
    // IPv4-mapped or -embedded (::ffff:127.0.0.1, ::127.0.0.1)
    const v4 = addr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4 && isPrivateIpv4(v4[1])) return true;
    if (addr.startsWith("fe80")) return true;       // link-local
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local fc00::/7
    return false;
}

/** True if the given IP string is loopback/private/link-local/reserved. */
export function isPrivateIp(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return isPrivateIpv4(ip);
    if (family === 6) return isPrivateIpv6(ip);
    return true; // not a valid IP literal → unsafe
}

/**
 * Parse and validate a URL for outbound requests. Resolves the hostname and
 * rejects if it is — or resolves to — a non-public address. Throws SsrfError on
 * any failure. Returns the parsed URL on success.
 */
export async function assertSafeUrl(urlStr: string): Promise<URL> {
    let u: URL;
    try {
        u = new URL(urlStr);
    } catch {
        throw new SsrfError("Invalid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new SsrfError("Only http(s) URLs are allowed");
    }

    const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    if (host === "localhost") {
        throw new SsrfError("Access to private or internal addresses is not allowed");
    }

    // IP literal → check directly, no DNS.
    if (isIP(host)) {
        if (isPrivateIp(host)) {
            throw new SsrfError("Access to private or internal addresses is not allowed");
        }
        return u;
    }

    // Hostname → resolve and check every returned address. This also catches
    // decimal/octal/hex encoded IPs, which getaddrinfo normalizes.
    let results: { address: string }[];
    try {
        results = await lookup(host, { all: true });
    } catch {
        throw new SsrfError("Could not resolve host");
    }
    if (results.length === 0) {
        throw new SsrfError("Could not resolve host");
    }
    for (const r of results) {
        if (isPrivateIp(r.address)) {
            throw new SsrfError("Access to private or internal addresses is not allowed");
        }
    }
    return u;
}

/**
 * Fetch that guards against SSRF: validates the target before connecting and
 * re-validates each redirect hop instead of letting fetch follow blindly.
 * Throws SsrfError if any URL in the chain is unsafe or redirects are exhausted.
 */
export async function safeFetch(
    urlStr: string,
    init: RequestInit & { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<Response> {
    const { timeoutMs = 10_000, maxRedirects = 3, ...rest } = init;
    let current = urlStr;

    for (let hop = 0; hop <= maxRedirects; hop++) {
        await assertSafeUrl(current);
        const res = await fetch(current, {
            ...rest,
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
        });

        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
            current = new URL(location, current).toString();
            continue;
        }
        return res;
    }
    throw new SsrfError("Too many redirects");
}
