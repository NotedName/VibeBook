import { useCallback, useState } from "react";

/** How many top-level comments load at a time. */
export const COMMENT_PAGE = 10;

export type CommentSort = "oldest" | "newest" | "top" | "replies";
export const COMMENT_SORTS: { id: CommentSort; label: string }[] = [
  { id: "oldest", label: "Oldest" },
  { id: "newest", label: "Newest" },
  { id: "top", label: "Most liked" },
  { id: "replies", label: "Most replies" },
];

const KEY = "vibebook.sort.comments";
const valid = new Set<string>(COMMENT_SORTS.map((s) => s.id));

/** The chosen comment order, remembered on this device. */
export function useCommentSort(): [CommentSort, (s: CommentSort) => void] {
  const [sort, setSort] = useState<CommentSort>(() => {
    try { const v = localStorage.getItem(KEY); if (v && valid.has(v)) return v as CommentSort; } catch { /* storage blocked */ }
    return "oldest";
  });
  const set = useCallback((s: CommentSort) => {
    setSort(s);
    try { localStorage.setItem(KEY, s); } catch { /* not remembered, still works */ }
  }, []);
  return [sort, set];
}
