import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canAccessChat } from "@/lib/chat-access";
import { addViewer, removeViewer, subscribe, getViewers, type RealtimeEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for a collaborative chat. Pushes message, presence,
 * typing, and assistant-status events to every connected workspace member.
 *
 * Behind nginx, the SSE location needs `proxy_buffering off;` and a generous
 * `proxy_read_timeout` so events flush immediately and the connection isn't
 * dropped between 25s heartbeats.
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!(await canAccessChat(chatId, userId, isAdmin))) {
        return new Response("Forbidden", { status: 403 });
    }

    const viewer = {
        userId,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
    };

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream({
        start(controller) {
            const send = (event: RealtimeEvent) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch { /* controller closed */ }
            };

            unsubscribe = subscribe(chatId, send);
            addViewer(chatId, viewer);

            // Initial presence snapshot for the freshly connected client.
            send({ type: "presence", viewers: getViewers(chatId) });

            heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(": ping\n\n"));
                } catch { /* controller closed */ }
            }, 25_000);

            const cleanup = () => {
                if (heartbeat) clearInterval(heartbeat);
                unsubscribe?.();
                removeViewer(chatId, userId);
                try { controller.close(); } catch { /* already closed */ }
            };
            req.signal.addEventListener("abort", cleanup);
        },
        cancel() {
            if (heartbeat) clearInterval(heartbeat);
            unsubscribe?.();
            removeViewer(chatId, userId);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
