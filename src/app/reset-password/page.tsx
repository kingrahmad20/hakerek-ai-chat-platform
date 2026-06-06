import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Bot, ArrowLeft } from "lucide-react";
import ResetPasswordForm from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    if (!token) redirect("/forgot-password");

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    const valid = record && record.identifier.startsWith("reset:") && record.expires >= new Date();

    if (!valid) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600/20 rounded-2xl mb-4">
                        <Bot size={32} className="text-red-400" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
                    <p className="text-gray-400 text-sm mb-6">
                        The password reset link has expired or is invalid. Please request a new one.
                    </p>
                    <a
                        href="/forgot-password"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Request New Link
                    </a>
                    <a href="/login" className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors">
                        <ArrowLeft size={14} /> Back to Sign In
                    </a>
                </div>
            </div>
        );
    }

    return <ResetPasswordForm token={token} />;
}
