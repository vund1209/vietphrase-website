import { LoadingSpinner } from "@/components/LoadingSpinner";

// A chapter viewed for the first time scrapes its source page on the fly
// (see docs/ARCHITECTURE.md "Scrape timing: lazy, on first view") -- this
// can take a few real seconds, so this loading state matters more here
// than on most other routes.
export default function Loading() {
  return <LoadingSpinner label="Đang tải chương (có thể mất vài giây nếu chưa từng xem)..." />;
}
