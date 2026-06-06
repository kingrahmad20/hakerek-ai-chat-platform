import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const base = process.env.NEXTAUTH_URL ?? "https://hakerek.com";
    return [
        { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
        { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    ];
}
