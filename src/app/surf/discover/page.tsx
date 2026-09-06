import Link from "next/link";
import { Globe } from "@phosphor-icons/react/dist/ssr";
import { listDiscoverSites } from "@/lib/sites/registry";

// Discover mode's source picker -- browse a curated list of known
// Chinese web-novel sites (currently just book.sfacg.com), then drill
// into that source's own book list at /surf/discover/[source]. See the
// planning doc's section 14: this is additive discovery/navigation on
// top of Browse mode's existing fetch infrastructure, not a second
// add-book pipeline -- the actual embed still goes through the existing
// POST /api/novels flow, one click at a time, from inside that list.
export default function DiscoverSourcesPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Khám phá theo nguồn</h1>
        <p className="text-sm text-muted-foreground">
          Duyệt danh sách truyện thật từ các trang web tiếng Trung đã hỗ trợ, rồi nhúng thẳng
          truyện bạn muốn đọc vào thư viện -- không cần tự đi tìm và dán URL.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {listDiscoverSites().map((site) => (
          <Link
            key={site.id}
            href={`/surf/discover/${site.id}`}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Globe size={22} className="text-accent" weight="duotone" />
            <span className="font-medium">{site.displayName}</span>
            <span className="text-xs text-muted-foreground">{site.discover.hostname}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
