import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Bot } from "lucide-react";

export default async function VerifyEmailPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;

    if (!token) {
        return <Result type="error" message="Invalid verification link." />;
    }

    const record = await prisma.verificationToken.findUnique({ where: { token } });

    if (!record || !record.identifier.startsWith("verify:")) {
        return <Result type="error" message="Link is invalid or has already been used." />;
    }

    if (record.expires < new Date()) {
        await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
        return (
            <Result
                type="expired"
                message="Verification link has expired. Please register again or contact an administrator."
            />
        );
    }

    const email = record.identifier.replace("verify:", "");
    await prisma.user.update({ where: { email }, data: { emailVerified: new Date() } });
    await prisma.verificationToken.delete({ where: { token } });

    redirect("/login?verified=1");
}

function Result({ type, message }: { type: "error" | "expired"; message: string }) {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${type === "expired" ? "bg-yellow-500/20" : "bg-red-600/20"}`}>
                    <Bot size={32} className={type === "expired" ? "text-yellow-400" : "text-red-400"} />
                </div>
                <h1 className="text-xl font-bold text-white mb-2">
                    {type === "expired" ? "Link Expired" : "Verification Failed"}
                </h1>
                <p className="text-gray-400 text-sm mb-6">{message}</p>
                <a
                    href="/login"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    Go to Sign In
                </a>
            </div>
        </div>
    );
}
