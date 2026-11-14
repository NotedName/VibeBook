import { useEffect, useState, type FormEvent } from "react";
import { gifSearchEnabled, parseGif, searchGifs, STICKER_PACKS, type GifResult, type Media } from "./stickers";
import { CloseIcon } from "./icons";

/** Panel for choosing a sticker or a GIF to attach to a comment. */
export default function MediaPicker({ onPick }: { onPick: (media: Media) => void }) {
  const [tab, setTab] = useState<"stickers" | "gifs">("stickers");
  return (
    <div className="media-picker" role="group" aria-label="Add a sticker or GIF">
      <div className="media-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "stickers"} className={tab === "stickers" ? "on" : ""}
          onClick={() => setTab("stickers")}>Stickers</button>
        <button type="button" role="tab" aria-selected={tab === "gifs"} className={tab === "gifs" ? "on" : ""}
          onClick={() => setTab("gifs")}>GIFs</button>
      </div>
      {tab === "stickers" ? (
        <div className="sticker-packs">
          {STICKER_PACKS.map((pack) => (
            <section key={pack.label}>
              <h3>{pack.label}</h3>
              <div className="sticker-grid">
                {pack.stickers.map((s) => (
                  <button key={s} type="button" aria-label={`Sticker ${s}`} onClick={() => onPick({ sticker: s, gif: "" })}>{s}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : <GifTab onPick={onPick} />}
    </div>
  );
}

function GifTab({ onPick }: { onPick: (media: Media) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    if (!gifSearchEnabled) return;
    let live = true;
    const t = setTimeout(() => {
      searchGifs(text).then(
        (r) => { if (live) { setResults(r); setError(""); } },
        () => { if (live) setError("Could not load GIFs. Check your connection."); },
      );
    }, text ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [text]);

  function submitLink(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = parseGif(link);
    if (!url) { setLinkError("Paste a GIF link from Giphy or Tenor (https)."); return; }
    onPick({ sticker: "", gif: url });
  }

  return (
    <div className="gif-tab">
      {gifSearchEnabled && (
        <>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Search GIFs" aria-label="Search GIFs"
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
          {error && <p className="error">{error}</p>}
          {results?.length === 0 && !error && <p className="hint">No GIFs found.</p>}
          <div className="gif-grid">
            {results?.map((g) => (
              <button key={g.id} type="button" aria-label={g.title} onClick={() => onPick({ sticker: "", gif: g.url })}>
                <img src={g.preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
          {results && <p className="hint">Powered by GIPHY</p>}
        </>
      )}
      <div className="gif-link">
        <input type="url" inputMode="url" value={link} aria-label="GIF link"
          onChange={(e) => { setLink(e.target.value); setLinkError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submitLink(e); }}
          placeholder="Paste a Giphy or Tenor GIF link" />
        <button type="button" className="btn small" disabled={!link.trim()} onClick={submitLink}>Use</button>
      </div>
      {linkError && <p className="error">{linkError}</p>}
    </div>
  );
}

/** The attached sticker or GIF as it will be posted, with a way to take it off. */
export function MediaPreview({ media, onRemove }: { media: Media; onRemove: () => void }) {
  return (
    <div className="media-preview">
      {media.sticker
        ? <span className="comment-sticker" aria-label={`Sticker ${media.sticker}`}>{media.sticker}</span>
        : <img className="comment-gif" src={media.gif} alt="Selected GIF" referrerPolicy="no-referrer" />}
      <button type="button" className="icon-btn" aria-label="Remove sticker or GIF" onClick={onRemove}><CloseIcon /></button>
    </div>
  );
}
