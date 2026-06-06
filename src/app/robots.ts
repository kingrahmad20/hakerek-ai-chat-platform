import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/api/", "/profile"],
        },
        sitemap: `${process.env.NEXTAUTH_URL ?? "https://hakerek.com"}/sitemap.xml`,
    };
}
