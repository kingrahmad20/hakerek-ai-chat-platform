import { I18nProvider } from "@/components/providers/i18n-provider";
import { NoBodyScroll } from "./no-body-scroll";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <I18nProvider initialLocale="en">
            <NoBodyScroll />
            {children}
        </I18nProvider>
    );
}
