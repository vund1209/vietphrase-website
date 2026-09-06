"use client";

// /search's tag filter -- same TagCombobox as the novel page, but
// selecting/removing a tag here just edits the URL's `tags` query param
// (comma-separated slugs) instead of writing to a novel. See
// src/lib/novelBrowse.ts's tags field/buildNovelWhere and the planning
// doc's section 13 ("matches ANY selected tag, not all").
import { useRouter, useSearchParams } from "next/navigation";
import { TagChip } from "./TagChip";
import { TagCombobox } from "./TagCombobox";
import type { TagOption } from "@/lib/tags";

interface SearchTagFilterProps {
  allTags: TagOption[];
  selectedTags: TagOption[];
}

export function SearchTagFilter({ allTags, selectedTags }: SearchTagFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushWithTags(slugs: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (slugs.length > 0) {
      params.set("tags", slugs.join(","));
    } else {
      params.delete("tags");
    }
    params.delete("page");
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedTags.map((tag) => (
        <TagChip
          key={tag.id}
          label={tag.name}
          onRemove={() => pushWithTags(selectedTags.filter((t) => t.slug !== tag.slug).map((t) => t.slug))}
        />
      ))}
      <TagCombobox
        allTags={allTags}
        excludeIds={new Set(selectedTags.map((t) => t.id))}
        onSelect={(tag) => pushWithTags([...selectedTags.map((t) => t.slug), tag.slug])}
        triggerLabel="Lọc theo tag"
      />
    </div>
  );
}
