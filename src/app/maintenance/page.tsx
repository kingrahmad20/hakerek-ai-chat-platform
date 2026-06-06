import { Wrench } from "lucide-react";

export default function MaintenancePage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white px-4">
            <div className="text-center max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                        <Wrench size={40} className="text-yellow-400" />
                    </div>
                </div>
                <h1 className="text-3xl font-bold mb-3">Under Maintenance</h1>
                <p className="text-gray-400 text-base leading-relaxed mb-8">
                    We&apos;re currently performing scheduled maintenance. We&apos;ll be back online shortly. Thank you for your patience.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    Maintenance in progress
                </div>
            </div>
        </div>
    );
}
