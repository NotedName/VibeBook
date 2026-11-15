import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "./scrollLock";
import { CameraIcon, CloseIcon, RotateIcon } from "./icons";

/**
 * A live camera for taking a picture to send (used on computers; phones open their own camera app instead, see Composer).
 * The picture is handed back as a File, like one picked from the gallery, so it lands with the other photos waiting to be sent.
 */
export default function CameraSheet({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [cameras, setCameras] = useState(1);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) { setError("This browser cannot open the camera."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }).then(async (s) => {
      if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      setError("");
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setReady(true);
      navigator.mediaDevices.enumerateDevices().then((d) => live && setCameras(d.filter((x) => x.kind === "videoinput").length), () => undefined);
    }, (err: unknown) => {
      if (!live) return;
      const name = (err as { name?: string }).name;
      setError(name === "NotAllowedError" ? "Camera access is blocked. Allow the camera for this site in your browser settings, then try again."
        : name === "NotFoundError" ? "No camera was found on this device." : "The camera could not be started.");
    });
    return () => { live = false; };
  }, [facing]);
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setError("The picture could not be taken."); return; }
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet camera-sheet" role="dialog" aria-modal="true" aria-label="Take a photo">
        <div className="sheet-head">
          <h2>Take a photo</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {error ? <p className="error note" role="alert">{error}</p> : (
            <div className="camera-view">
              <video ref={video} playsInline muted className={facing === "user" ? "mirror" : ""} aria-label="Camera preview" />
              {!ready && <p className="hint camera-wait" role="status">Starting the camera…</p>}
            </div>
          )}
          <div className="camera-actions">
            {cameras > 1 && !error && (
              <button type="button" className="icon-btn" aria-label="Switch camera" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}><RotateIcon /></button>
            )}
            <button type="button" className="shutter" aria-label="Take photo" disabled={!ready || !!error} onClick={snap}><CameraIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
