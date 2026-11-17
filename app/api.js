// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Every answer is cached and revalidated. An entry younger than a minute is
// served from the cache with no request at all (the API's ETags are bound to
// the minute); an older one is revalidated with If-None-Match, and a 304
// reuses the cached body. Small answers also persist in localStorage across
// visits, so a return visit starts from the cache and only revalidates.

const API = 'https://make.fun/api';
const FRESH_MS = 60_000;
const STORE_KEY = 'boardwalk-cache-v1';
const STORE_MAX_BYTES = 200_000;

const memory = new Map(); // url -> { etag, data, at }
const inflight = new Map(); // url -> Promise

function readStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    for (const [url, entry] of Object.entries(saved)) {
      if (entry && typeof entry.data !== 'undefined') memory.set(url, entry);
    }
  } catch {
    // Private mode or a corrupt store: the memory cache still works.
  }
}

function writeStore() {
  try {
    const out = {};
    let bytes = 0;
    for (const [url, entry] of memory) {
      const s = JSON.stringify(entry);
      if (bytes + s.length > STORE_MAX_BYTES) continue;
      out[url] = entry;
      bytes += s.length;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch {
    // Storage full or unavailable: ignore, the memory cache still works.
  }
}

readStore();

async function get(path) {
  const url = API + path;
  const now = Date.now();
  const hit = memory.get(url);
  if (hit && now - hit.at < FRESH_MS) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const job = (async () => {
    const headers = {};
    if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res;
    try {
      res = await fetch(url, { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304 && hit) {
      hit.at = now;
      writeStore();
      return hit.data;
    }
    if (!res.ok) throw new Error(`make.fun API answered ${res.status} for ${path}`);
    const data = await res.json();
    memory.set(url, { etag: res.headers.get('etag'), data, at: now });
    writeStore();
    return data;
  })();
  inflight.set(url, job);
  try {
    return await job;
  } finally {
    inflight.delete(url);
  }
}

/** The open bounties: { items: [...] } (activity=times leaves out the activity a board does not show). */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard: { items: [{ rank, handle, title, ... }] }. */
export const getLeaderboard = (slug) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** An account's public profile, by its handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);

/** An avatar or entry image the API points at, as an absolute URL on make.fun. */
export const imageUrl = (path) => (path ? (path.startsWith('http') ? path : API + path) : '');
