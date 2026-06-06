// Shared image-generation helper used by both the standalone /api/generate-image
// route and the inline `generate_image` agent tool (see src/lib/agent-tools.ts).
// Calls OpenRouter's image-generation endpoint, then downloads the result and
// returns it as a base64 data URL so the image is stored permanently rather than
// as an expiring provider URL.

export type ImageGenResult =
    | { ok: true; dataUrl: string; revisedPrompt: string }
    | { ok: false; status: number; error: string };

export const DEFAULT_IMAGE_MODEL = "openai/dall-e-3";

export async function generateImage(
    prompt: string,
    apiKey: string,
    model: string = DEFAULT_IMAGE_MODEL
): Promise<ImageGenResult> {
    const trimmed = prompt.trim();
    if (!trimmed) return { ok: false, status: 400, error: "Empty prompt" };

    const genRes = await fetch("https://openrouter.ai/api/v1/images/generations", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, prompt: trimmed, n: 1, size: "1024x1024" }),
    });

    if (!genRes.ok) {
        const errText = await genRes.text().catch(() => "");
        return { ok: false, status: genRes.status, error: errText || `HTTP ${genRes.status}` };
    }

    const data = await genRes.json();
    const imageUrl: string | undefined = data.data?.[0]?.url;
    const revisedPrompt: string = data.data?.[0]?.revised_prompt ?? trimmed;

    if (!imageUrl) {
        return { ok: false, status: 500, error: "No image URL returned by provider" };
    }

    // Fetch and convert to base64 so the image is stored permanently.
    const imgRes = await fetch(imageUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const dataUrl = `data:${contentType};base64,${base64}`;

    return { ok: true, dataUrl, revisedPrompt };
}
