import { LoadingSpinner } from "@/components/LoadingSpinner";

// Browse mode falls back to a real headless-browser render for sites that
// block a plain fetch (see src/lib/browserFetch.ts) -- that path alone can
// take several seconds, on top of the network fetch itself, so this
// loading state matters more here than on most other routes.
export default function Loading() {
  return <LoadingSpinner label="Đang tải trang gốc (có thể mất lâu hơn với vài trang)..." />;
}
