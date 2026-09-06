import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// Next's file-convention sitemap.xml. Static reader-facing routes plus
// every embedded novel's own page -- not per-chapter (a single novel can
// run 1000+ chapters; the book page is the meaningful crawl target, same
// granularity real novel-aggregator sites use).
//
// Revalidated hourly rather than force-dynamic (unlike most of this app's
// pages) -- new novels get embedded constantly, but a sitemap doesn't need
// to be byte-fresh, just eventually consistent; regenerating on every
// crawler hit would be wasted DB work for no real benefit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vietphrase-website.vercel.app";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/surf`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/surf/discover`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/translate`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const novels = await prisma.novel.findMany({
    select: { slug: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const novelRoutes: MetadataRoute.Sitemap = novels.map((novel) => ({
    url: `${base}/novels/${novel.slug}`,
    lastModified: novel.createdAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...novelRoutes];
}
