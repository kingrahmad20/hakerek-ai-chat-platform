export async function verifyTurnstile(token: string, secretKey: string): Promise<boolean> {
    if (!token || !secretKey) return false;
    try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: secretKey, response: token }).toString(),
        });
        const data = await res.json();
        return data.success === true;
    } catch {
        return false;
    }
}
