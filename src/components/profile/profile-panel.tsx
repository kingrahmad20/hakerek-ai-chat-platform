"use client";
import { useState, useEffect } from "react";
import ProfileForm from "./profile-form";
import { type Locale, DEFAULT_LOCALE, isValidLocale } from "@/i18n/translations";

interface ProfilePanelProps {
    onClose: () => void;
}

export function ProfilePanel({ onClose }: ProfilePanelProps) {
    const [userData, setUserData] = useState<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        systemPrompt: string | null;
        locale: Locale;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/user/profile")
            .then((r) => r.json())
            .then((data) => {
                setUserData({
                    ...data,
                    locale: isValidLocale(data.locale) ? data.locale : DEFAULT_LOCALE,
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-950">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    if (!userData) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-500 text-sm">
                Failed to load profile.
            </div>
        );
    }

    return <ProfileForm user={userData} onClose={onClose} />;
}
