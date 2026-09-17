import type { Lesson } from "@/db/schema";

/** Turns a lesson video URL into an embeddable player: YouTube / Vimeo → iframe, anything else → <video>. */
export function videoEmbed(url: string): { kind: "iframe"; src: string } | { kind: "video"; src: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Values are validated on save, but anything else that reached the column must not become a live element.
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") || (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : "");
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d{5,}$/.test(p));
    return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  return { kind: "video", src: u.toString() };
}

/**
 * Renders what a lesson contains: an embedded video (link or uploaded video file), then lesson notes.
 * `assetSrc` is the inline streaming URL for an uploaded video/audio asset, when the lesson has one.
 */
export function LessonPlayer({ lesson, asset, title }: { lesson: Lesson; asset?: { id: string; contentType: string; filename: string } | null; title: string }) {
  const embed = lesson.videoUrl ? videoEmbed(lesson.videoUrl) : null;
  const media = asset && /^(video|audio)\//.test(asset.contentType) ? asset : null;
  if (!embed && !media && !lesson.body) return null;
  return (
    <div className="sf-lesson-player">
      {embed?.kind === "iframe" && (
        <div className="sf-video">
          <iframe src={embed.src} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      )}
      {embed?.kind === "video" && (
        <div className="sf-video">
          <video src={embed.src} controls playsInline preload="metadata" />
        </div>
      )}
      {!embed && media && media.contentType.startsWith("video/") && (
        <div className="sf-video">
          <video src={`/api/download/asset/${media.id}?inline=1`} controls playsInline preload="metadata" />
        </div>
      )}
      {!embed && media && media.contentType.startsWith("audio/") && <audio src={`/api/download/asset/${media.id}?inline=1`} controls preload="metadata" className="w-full" />}
      {lesson.body && (
        <div className="sf-lesson-notes">
          {lesson.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>
              {para.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
