"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * A drop photo or video, chosen as a file.
 *
 * These were link fields, which meant hosting the file somewhere first and
 * pasting its address back — and a pasted address is how the first drop went
 * out with no photo and somebody else's video. Now the file is picked or
 * dropped here, sent straight to the site, and shown back before the drop is
 * saved, so what is attached is what you have seen.
 *
 * XMLHttpRequest rather than fetch for one reason: fetch cannot report upload
 * progress, and a 200 MB recording with no progress bar looks exactly like a
 * frozen page.
 */
export function MediaUpload({
  adminKey,
  kind,
  label,
  hint,
  value,
  onChange,
  allowLink = false,
  disabled = false,
}: {
  adminKey: string;
  kind: "image" | "video";
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  /* For the presenter slot, which can also be a live stream only a link can
     reach. */
  allowLink?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = (file: File) => {
    setError("");
    const expected = kind === "image" ? /^image\//.test(file.type) : /^video\//.test(file.type);
    if (file.type && !expected) {
      setError(kind === "image" ? "Choose a photo (JPG, PNG, WebP)." : "Choose a video (MP4, MOV, WebM).");
      return;
    }
    const request = new XMLHttpRequest();
    request.open("POST", `/api/admin/drop-media?kind=${kind}`);
    request.setRequestHeader("X-Admin-Key", adminKey);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setProgress(null);
      let body: { url?: string; error?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        /* An error page instead of JSON is still an error. */
      }
      if (request.status >= 200 && request.status < 300 && body.url) onChange(body.url);
      else setError(body.error || `The upload failed (${request.status}).`);
    };
    request.onerror = () => {
      setProgress(null);
      setError("The upload failed. Check your connection and try again.");
    };
    setProgress(0);
    request.send(file);
  };

  const uploading = progress !== null;
  const isVideo = kind === "video" || /\.(?:mp4|mov|webm)(?:[?#].*)?$/i.test(value);
  const isFile = value.startsWith("/");

  return (
    <div className="py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</span>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}

      <input
        ref={input}
        type="file"
        accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/quicktime,video/webm"}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />

      {value && !uploading ? (
        <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface">
            {isVideo && isFile ? (
              <video src={value} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : !isVideo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-[0.65rem] text-fg-subtle">link</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-fg-muted">{isFile ? "Uploaded" : value}</p>
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => input.current?.click()}
                className="cursor-pointer text-xs font-semibold text-fg underline-offset-4 hover:underline disabled:opacity-55"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange("")}
                className="cursor-pointer text-xs font-semibold text-fg-muted underline-offset-4 hover:underline disabled:opacity-55"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading || !adminKey}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file && !disabled) upload(file);
          }}
          className={cn(
            "mt-1.5 flex h-16 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed px-3 text-sm transition-colors disabled:cursor-default disabled:opacity-55",
            dragging ? "border-fg bg-surface-2 text-fg" : "border-border-strong text-fg-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          {uploading ? (
            <span className="w-full">
              <span className="block text-xs">Uploading… {progress}%</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full bg-lime transition-[width]" style={{ width: `${progress}%` }} />
              </span>
            </span>
          ) : (
            <span>{kind === "image" ? "Choose a photo" : "Choose a video"} or drop it here</span>
          )}
        </button>
      )}

      {allowLink && !value && !uploading && (
        linkOpen ? (
          <input
            type="url"
            placeholder="https://… live stream embed link"
            disabled={disabled}
            onBlur={(event) => event.target.value.trim() && onChange(event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const text = (event.target as HTMLInputElement).value.trim();
                if (text) onChange(text);
              }
            }}
            className="mt-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg outline-none focus:border-border-strong"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="mt-1.5 cursor-pointer text-xs text-fg-muted underline underline-offset-4 hover:text-fg"
          >
            or use a live stream link instead
          </button>
        )
      )}

      {error && <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
