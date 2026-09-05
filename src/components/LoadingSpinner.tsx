// Shared route-transition indicator for loading.tsx files across
// src/app -- Next.js renders these automatically while a server
// component segment is still fetching data, replacing what used to be a
// blank flash with an explicit "this is working" cue.
interface Props {
  label?: string;
}

export function LoadingSpinner({ label }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-16 text-neutral-500">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-300" />
      <span className="text-sm">{label ?? "Đang tải..."}</span>
    </div>
  );
}
