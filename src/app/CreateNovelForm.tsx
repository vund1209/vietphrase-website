"use client";

// "Tạo truyện của bạn" mode -- metadata-only creation of a USER_CREATED
// novel (title required, everything else optional since there's no
// source page to scrape). Content is added afterward from the novel
// page's owner actions (manual chapter / .txt import). See
// AddBookModal.tsx and the planning doc's section 8.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateNovelForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/novels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim() || undefined,
          description: description.trim() || undefined,
          coverImageUrl: coverImageUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Yêu cầu thất bại (${res.status})`);
      }
      router.push(`/novels/${data.novel.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="text"
        required
        placeholder="Tên truyện *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <input
        type="text"
        placeholder="Tác giả (tùy chọn)"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <textarea
        placeholder="Giới thiệu (tùy chọn)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <input
        type="url"
        placeholder="URL ảnh bìa (tùy chọn)"
        value={coverImageUrl}
        onChange={(e) => setCoverImageUrl(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="cursor-pointer rounded-md bg-secondary px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-900"
      >
        {loading ? "Đang tạo…" : "Tạo truyện"}
      </button>
      <p className="text-xs text-muted-foreground">
        Sau khi tạo, bạn có thể thêm chương thủ công hoặc nhập file .txt từ trang truyện.
      </p>
      <p className="text-xs text-muted-foreground">
        Bạn chịu trách nhiệm về nội dung mình đăng tải. Nội dung vi phạm bản quyền hoặc pháp luật sẽ
        bị gỡ bỏ.
      </p>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </form>
  );
}
