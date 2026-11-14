import { useMemo } from "react";
import { parseVideo } from "./video";

export default function VideoPlayer({ url, title }: { url: string; title: string }) {
  const video = useMemo(() => parseVideo(url), [url]);
  if (!video) return null;
  return (
    <div className="video">
      {video.kind === "file" ? (
        <video src={video.src} controls preload="metadata" playsInline aria-label={`Video: ${title}`} />
      ) : (
        <iframe src={video.src} title={`Video: ${title}`} loading="lazy" allowFullScreen
          allow="encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin" />
      )}
    </div>
  );
}
