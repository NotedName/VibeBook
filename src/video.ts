export const VIDEO_URL_MAX = 300;

export type Video = { kind: "youtube" | "vimeo" | "file"; src: string };

const YT_ID = /^[\w-]{11}$/;

/**
 * Turns a pasted link into something safe to embed. Only https links to YouTube, Vimeo or a
 * direct video file are accepted, so a post can never point an iframe at an arbitrary site.
 */
export function parseVideo(raw: string): Video | null {
  const text = raw.trim();
  if (!text || text.length > VIDEO_URL_MAX) return null;
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");

  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? "";
  }
  if (YT_ID.test(id)) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };

  if (host === "vimeo.com") {
    const m = u.pathname.match(/^\/(\d+)(?:\/([a-z0-9]+))?/i);
    if (m) return { kind: "vimeo", src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ""}` };
  }

  if (/\.(mp4|webm|ogv|mov|m4v)$/i.test(u.pathname)) return { kind: "file", src: u.href };
  return null;
}
