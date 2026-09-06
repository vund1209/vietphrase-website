import type { MetadataRoute } from "next";

// Next's file-convention robots.txt. Admin/API/auth surfaces have no
// reason to be crawled; everything reader-facing is fair game.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vietphrase-website.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/login", "/signup"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
