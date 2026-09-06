import { LoadingSpinner } from "@/components/LoadingSpinner";

// Same reasoning as /surf/browse/loading.tsx -- this route does a real,
// live fetch of a source site's list page (occasionally a full
// headless-browser launch for a Cloudflare-gated source like
// 69shuba.com), which previously had no loading state at all: clicking
// "Khám phá theo nguồn", switching pages, or toggling sort left the
// reader looking at a frozen page for however long that fetch took.
export default function Loading() {
  return <LoadingSpinner label="Đang tải danh sách truyện từ nguồn..." />;
}
