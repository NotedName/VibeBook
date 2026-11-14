/** What can be attached to a comment besides text. Either field is "" when unused. */
export type Media = { sticker: string; gif: string };
export const NO_MEDIA: Media = { sticker: "", gif: "" };

export const STICKER_PACKS: { label: string; stickers: string[] }[] = [
  { label: "Reactions", stickers: ["🔥", "👏", "🙌", "💯", "🎉", "🥳", "🤩", "😂", "🥹", "😎", "🤯", "🫡"] },
  { label: "Work", stickers: ["💻", "🛠️", "🔧", "🧠", "🚀", "✅", "📈", "🏆", "⚡", "💡", "📚", "🎯"] },
  { label: "Vibes", stickers: ["❤️", "💜", "🫶", "🤝", "👀", "🙏", "💪", "😴", "☕", "🍕", "🌈", "✨"] },
];

const ALL_STICKERS = new Set(STICKER_PACKS.flatMap((p) => p.stickers));
export const isSticker = (s: string) => ALL_STICKERS.has(s);

export const GIF_URL_MAX = 300;
/** Hosts a GIF may be loaded from. firestore.rules checks the same list. */
const GIF_HOST = /^https:\/\/(?:media[0-9]*\.giphy\.com|i\.giphy\.com|media[0-9]*\.tenor\.com|c\.tenor\.com)\//;
export const isGifUrl = (u: string) => u.length <= GIF_URL_MAX && GIF_HOST.test(u);

/** Turns something pasted into a loadable GIF url, or "" when it is not from a supported site. A Giphy page link is converted. */
export function parseGif(input: string): string {
  const text = input.trim();
  if (isGifUrl(text)) return text;
  const page = /^https:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers|clips)\/(?:[^/?#]*-)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(text);
  if (page) return `https://media.giphy.com/media/${page[1]}/giphy.gif`;
  return "";
}

/** Giphy search is available when a key is set in .env as VITE_GIPHY_KEY. Without one, people paste a link. */
const GIPHY_KEY = import.meta.env?.VITE_GIPHY_KEY as string | undefined;
export const gifSearchEnabled = !!GIPHY_KEY;

type GiphyItem = { id: string; title?: string; images: { fixed_height: { url: string }; fixed_height_small: { url: string } } };
export type GifResult = { id: string; title: string; preview: string; url: string };

export async function searchGifs(q: string): Promise<GifResult[]> {
  const term = q.trim();
  const url = `https://api.giphy.com/v1/gifs/${term ? "search" : "trending"}?api_key=${encodeURIComponent(GIPHY_KEY ?? "")}`
    + `&limit=24&rating=g${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("GIF search failed");
  const json = (await res.json()) as { data: GiphyItem[] };
  return json.data
    .map((g) => ({ id: g.id, title: g.title ?? "GIF", preview: g.images.fixed_height_small.url, url: g.images.fixed_height.url }))
    .filter((g) => isGifUrl(g.url) && isGifUrl(g.preview));
}
