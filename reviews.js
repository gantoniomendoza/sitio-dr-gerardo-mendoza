/**
 * Cloudflare Pages Function — GET /api/reviews
 *
 * Reseñas REALES de Google, solo de 4 y 5 estrellas, de la más reciente a la más antigua, con paginación real.
 * Nunca inventa contenido: si no hay credenciales o no hay reseñas devuelve { reviews:[], next:null }.
 *
 * Parámetros:  ?limit=1–20 (por defecto 6) · ?after=<cursor>   (cursor opaco = nextPageToken de Google)
 * Respuesta:   { reviews:[{ id, author, rating, text, date, source:'google', url? }], next:<cursor|null>, summary?:{rating,count} }
 *              Cada elemento ya viene filtrado (rating ≥ 4). Si una página de Google trae reseñas que no cumplen, se
 *              descartan aquí y se pide la siguiente página hasta reunir `limit` (máx. 6 consultas por petición).
 *
 * PROVEEDOR A (recomendado, paginado): Google Business Profile API — mybusiness.googleapis.com/v4 (cuentas.locations.reviews)
 *   Variables (Cloudflare Pages → Settings → Variables and Secrets; los secretos como tipo Secret):
 *     GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN   credenciales OAuth del propietario del perfil (scope business.manage)
 *     GBP_ACCOUNT_ID, GBP_LOCATION_ID                       ids numéricos de la cuenta y de la ubicación
 *   Pagina con pageSize/pageToken y ordena por updateTime desc.
 *
 * PROVEEDOR B (alternativa sin OAuth, SIN paginación): Places API (New) — places.googleapis.com/v1
 *     GOOGLE_PLACES_KEY, GOOGLE_PLACE_ID
 *   Google solo entrega hasta 5 reseñas por lugar: se muestran las de 4–5 estrellas, ordenadas por fecha, y `next` es null.
 *
 * Ningún secreto llega al navegador ni vive en el repositorio.
 */
const CACHE_TTL = 600;               // 10 min en el borde
const MAX_UPSTREAM_PAGES = 6;        // páginas de Google consultadas como máximo por petición
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? `public, max-age=120, s-maxage=${CACHE_TTL}` : 'no-store'
  }
});

const timed = async (url, init = {}, ms = 8000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
};

/* ---------- Proveedor A: Business Profile ---------- */
let tokenCache = { value: '', exp: 0 };
async function accessToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60000) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: env.GBP_CLIENT_ID, client_secret: env.GBP_CLIENT_SECRET,
    refresh_token: env.GBP_REFRESH_TOKEN, grant_type: 'refresh_token'
  });
  const r = await timed('https://oauth2.googleapis.com/token', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw Object.assign(new Error('auth'), { code: 'auth_failed' });
  const d = await r.json();
  if (!d.access_token) throw Object.assign(new Error('auth'), { code: 'auth_failed' });
  tokenCache = { value: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3000) * 1000 };
  return tokenCache.value;
}

const fromGbp = r => ({
  id: String(r.reviewId || r.name || ''),
  author: r.reviewer && !r.reviewer.isAnonymous ? String(r.reviewer.displayName || '') : '',
  rating: STARS[r.starRating] || 0,
  text: String(r.comment || '').trim(),
  date: r.updateTime || r.createTime || '',
  source: 'google'
});

async function gbpPage(env, token, pageToken) {
  const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
  if (pageToken) q.set('pageToken', pageToken);
  const url = `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(env.GBP_ACCOUNT_ID)}/locations/${encodeURIComponent(env.GBP_LOCATION_ID)}/reviews?${q}`;
  const r = await timed(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth'), { code: 'auth_failed' });
  if (!r.ok) throw Object.assign(new Error('upstream'), { code: 'upstream_error' });
  const d = await r.json();
  return { items: (d.reviews || []).map(fromGbp), next: d.nextPageToken || null, summary: d.averageRating ? { rating: d.averageRating, count: d.totalReviewCount || 0 } : null };
}

/* ---------- Proveedor B: Places API (New) ---------- */
const fromPlaces = r => ({
  id: String(r.name || `${r.authorAttribution && r.authorAttribution.displayName}|${r.publishTime}`),
  author: r.authorAttribution ? String(r.authorAttribution.displayName || '') : '',
  rating: Number(r.rating) || 0,
  text: String((r.text && r.text.text) || (r.originalText && r.originalText.text) || '').trim(),
  date: r.publishTime || '',
  source: 'google',
  url: r.authorAttribution && /^https:\/\/(www\.)?google\.com\//.test(r.authorAttribution.uri || '') ? r.authorAttribution.uri : undefined
});

async function placesAll(env) {
  const r = await timed(`https://places.googleapis.com/v1/places/${encodeURIComponent(env.GOOGLE_PLACE_ID)}?languageCode=es`, {
    headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'reviews,rating,userRatingCount', accept: 'application/json' }
  });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth'), { code: 'auth_failed' });
  if (!r.ok) throw Object.assign(new Error('upstream'), { code: 'upstream_error' });
  const d = await r.json();
  return { items: (d.reviews || []).map(fromPlaces), summary: d.rating ? { rating: d.rating, count: d.userRatingCount || 0 } : null };
}

/* ---------- común ---------- */
const keep = r => r.id && r.rating >= 4 && r.rating <= 5;               // solo 4 y 5 estrellas, nunca las demás
const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

export async function onRequestGet(context) {
  const { request, env } = context;
  const wait = p => { try { context.waitUntil(p); } catch { /* sin contexto de ejecución */ } };
  const hasGbp = env.GBP_CLIENT_ID && env.GBP_CLIENT_SECRET && env.GBP_REFRESH_TOKEN && env.GBP_ACCOUNT_ID && env.GBP_LOCATION_ID;
  const hasPlaces = env.GOOGLE_PLACES_KEY && env.GOOGLE_PLACE_ID;
  if (!hasGbp && !hasPlaces) return json({ reviews: [], next: null, error: 'not_configured' });   // estado limpio: sin reseñas, nada inventado

  const qs = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(qs.get('limit') || '6', 10) || 6, 1), 20);
  const afterRaw = qs.get('after') || '';
  const after = /^[A-Za-z0-9_=\-.%~+/]{1,600}$/.test(afterRaw) ? afterRaw : '';

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(new URL(`/api/reviews?limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ''}`, request.url).toString());
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  try {
    let out;
    if (hasGbp) {
      const token = await accessToken(env);
      const reviews = [], seen = new Set();
      let cursor = after || null, summary = null, guard = 0, next = null;
      do {
        const page = await gbpPage(env, token, cursor);
        summary = summary || page.summary;
        for (const r of page.items.filter(keep).sort(byDateDesc)) if (!seen.has(r.id)) { seen.add(r.id); reviews.push(r); }
        cursor = page.next; next = page.next;
        guard++;
      } while (cursor && reviews.length < limit && guard < MAX_UPSTREAM_PAGES);
      out = { reviews, next, summary };
    } else {
      if (after) out = { reviews: [], next: null };                          // la API de Places no pagina: solo existe la primera página
      else {
        const all = await placesAll(env);
        out = { reviews: all.items.filter(keep).sort(byDateDesc), next: null, summary: all.summary };
      }
    }
    const res = json({ ...out, fetchedAt: new Date().toISOString() });
    if (cache) wait(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return json({ reviews: [], next: null, error: e && e.code ? e.code : 'upstream_unreachable' }, 502);
  }
}
