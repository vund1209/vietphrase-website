import { X } from "@phosphor-icons/react/dist/ssr";

interface TagChipProps {
  label: string;
  onRemove?: () => void;
  removing?: boolean;
}

// Shared small pill for a single tag -- used both read-only (novel page,
// no onRemove) and as a removable filter chip (search page). See the
// planning doc's section 13.
export function TagChip({ label, onRemove, removing }: TagChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Bỏ tag ${label}`}
          className="cursor-pointer hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={10} weight="bold" />
        </button>
      )}
    </span>
  );
}
