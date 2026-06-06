import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DNS resolution so the hostname path is deterministic and offline.
vi.mock("dns/promises", () => ({
    lookup: vi.fn(),
}));

import { lookup } from "dns/promises";
import { isPrivateIp, assertSafeUrl, SsrfError } from "@/lib/ssrf";

const mockLookup = vi.mocked(lookup);

function resolvesTo(...addresses: string[]) {
    mockLookup.mockResolvedValue(addresses.map((address) => ({ address })) as never);
}

describe("isPrivateIp", () => {
    it.each([
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254", // cloud metadata
        "100.64.0.1", // CGNAT
        "0.0.0.0",
        "224.0.0.1", // multicast
    ])("treats %s as private", (ip) => {
        expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "93.184.216.34"])(
        "treats public %s as public",
        (ip) => {
            expect(isPrivateIp(ip)).toBe(false);
        }
    );

    it.each(["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1"])(
        "treats IPv6 %s as private",
        (ip) => {
            expect(isPrivateIp(ip)).toBe(true);
        }
    );

    it("treats IPv4-mapped private IPv6 as private", () => {
        expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    });

    it("treats a public IPv6 as public", () => {
        expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });

    it("treats non-IP strings as unsafe", () => {
        expect(isPrivateIp("not-an-ip")).toBe(true);
        expect(isPrivateIp("")).toBe(true);
    });
});

describe("assertSafeUrl", () => {
    beforeEach(() => {
        mockLookup.mockReset();
    });

    it("rejects non-http(s) protocols", async () => {
        await expect(assertSafeUrl("ftp://example.com")).rejects.toThrow(SsrfError);
        await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(SsrfError);
    });

    it("rejects invalid URLs", async () => {
        await expect(assertSafeUrl("http://")).rejects.toThrow(SsrfError);
        await expect(assertSafeUrl("not a url")).rejects.toThrow(SsrfError);
    });

    it("rejects the literal localhost hostname", async () => {
        await expect(assertSafeUrl("http://localhost/x")).rejects.toThrow(SsrfError);
    });

    it("rejects private IP literals without touching DNS", async () => {
        await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
            SsrfError
        );
        await expect(assertSafeUrl("http://127.0.0.1:8080")).rejects.toThrow(SsrfError);
        await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow(SsrfError);
        expect(mockLookup).not.toHaveBeenCalled();
    });

    it("accepts a public IP literal", async () => {
        const u = await assertSafeUrl("https://8.8.8.8/");
        expect(u.hostname).toBe("8.8.8.8");
        expect(mockLookup).not.toHaveBeenCalled();
    });

    it("accepts a hostname that resolves only to public addresses", async () => {
        resolvesTo("93.184.216.34");
        const u = await assertSafeUrl("https://example.com/page");
        expect(u.hostname).toBe("example.com");
    });

    it("rejects a hostname that resolves to a private address (DNS rebinding)", async () => {
        resolvesTo("127.0.0.1");
        await expect(assertSafeUrl("https://evil.example.com")).rejects.toThrow(SsrfError);
    });

    it("rejects when any resolved address is private", async () => {
        resolvesTo("93.184.216.34", "10.0.0.1");
        await expect(assertSafeUrl("https://mixed.example.com")).rejects.toThrow(SsrfError);
    });

    it("rejects when the host cannot be resolved", async () => {
        mockLookup.mockRejectedValue(new Error("ENOTFOUND") as never);
        await expect(assertSafeUrl("https://nope.invalid")).rejects.toThrow(SsrfError);
    });

    it("rejects when resolution returns no addresses", async () => {
        resolvesTo();
        await expect(assertSafeUrl("https://empty.example.com")).rejects.toThrow(SsrfError);
    });
});
