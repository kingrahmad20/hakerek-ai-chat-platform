import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canAccessChat } from "@/lib/chat-access";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Broadcast a typing indicator to other viewers of a collaborative chat.
 * SSE is server→client only, so the client signals typing via this POST
 * (debounced) and receives others' typing events back over the SSE stream.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!(await canAccessChat(chatId, userId, isAdmin))) {
        return NextResponse.json({ ok: false }, { status: 403 });
    }

    let typing = false;
    try {
        const body = await req.json();
        typing = body?.typing === true;
    } catch { /* default false */ }

    publish(chatId, { type: "typing", userId, name: session.user.name ?? null, typing });
    return NextResponse.json({ ok: true });
}
