// YouTube links to listen to while focusing. Pure: tested on its own.

export interface YouTubeRef {
  video: string | null;
  list: string | null;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const LIST = /^[A-Za-z0-9_-]{10,64}$/;

/** The video and/or playlist in a YouTube link, or null. */
export function parseYouTube(link: string): YouTubeRef | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return ID.test(link.trim()) ? { video: link.trim(), list: null } : null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
  let video: string | null = null;
  if (host === "youtu.be") video = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") video = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) video = parts[1] ?? null;
  } else return null;
  const list = url.searchParams.get("list");
  const ref = { video: video && ID.test(video) ? video : null, list: list && LIST.test(list) ? list : null };
  return ref.video || ref.list ? ref : null;
}

/** The player's address: autoplay, loop, controllable from the island. */
export function embedUrl(r: YouTubeRef): string {
  const q = new URLSearchParams({ autoplay: "1", enablejsapi: "1", playsinline: "1", rel: "0" });
  if (r.list) q.set("list", r.list);
  if (r.video && !r.list) {
    q.set("loop", "1");
    q.set("playlist", r.video);
  }
  const path = r.video ? `embed/${r.video}` : "embed/videoseries";
  return `https://www.youtube-nocookie.com/${path}?${q}`;
}

export interface SavedLink {
  id: string;
  title: string;
  url: string;
}

export function sanitizeLinks(raw: unknown): SavedLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof l.url === "string" && !!parseYouTube(l.url as string))
    .map((l) => ({ id: typeof l.id === "string" ? l.id : String(Math.random()).slice(2), title: typeof l.title === "string" && l.title.trim() ? l.title.slice(0, 80) : "YouTube", url: l.url as string }))
    .slice(0, 50);
}
