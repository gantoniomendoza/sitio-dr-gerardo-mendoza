/**
 * Cloudflare Pages Function — GET /api/instagram
 *
 * Lee las publicaciones recientes de la cuenta profesional de Instagram con la API OFICIAL
 * (Instagram API with Instagram Login → https://graph.instagram.com). No hay scraping ni iframes.
 *
 * Seguridad: el token vive solo en variables del backend (nunca llega al navegador).
 *
 * Variables de entorno (Cloudflare Pages → Settings → Variables and Secrets):
 *   INSTAGRAM_TOKEN   (Secret, obligatoria) token de acceso de larga duración generado en Meta (vale 60 días)
 *   INSTAGRAM_LIMIT   (opcional) tamaño de página por defecto, 1–25 (por defecto 6)
 *
 * Binding opcional para que el token se renueve SOLO (recomendado):
 *   IG_KV             namespace de Workers KV. Si existe, la función renueva el token cuando
 *                     tiene más de ~20 días (refresh_access_token) y guarda el nuevo en KV.
 *
 * Parámetros:      ?limit=1–25 (por defecto 6) · ?after=<cursor> (paginación real de la API: paging.cursors.after)
 * Respuesta 200: { posts:[{id,caption,image,permalink,timestamp,type}], next:<cursor|null>, fetchedAt }  (más reciente primero;
 *                  `next` solo existe si la API informa que hay una página más antigua)
 * Errores:       { posts:[], error:'not_configured'|'token_expired'|'upstream_error'|'upstream_unreachable' }
 */
const GRAPH='https://graph.instagram.com';
const REFRESH_AFTER_MS=20*24*3600*1000;     // la API permite renovar a partir de 24 h y antes de vencer (60 días)
const CACHE_TTL=900;                        // 15 min en el borde de Cloudflare

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':status===200?`public, max-age=300, s-maxage=${CACHE_TTL}`:'no-store'}});

/* El token activo: el guardado en KV (renovado) o, si no hay KV, el de la variable de entorno.
   Si el usuario pega un token NUEVO en la variable, tiene prioridad sobre el guardado. */
async function getToken(env){
  const envTok=(env.INSTAGRAM_TOKEN||'').trim();
  const kv=env.IG_KV;
  if(!kv) return {token:envTok,refreshedAt:null,kv:null};
  try{
    const [stored,seen,at]=await Promise.all([kv.get('ig_token'),kv.get('ig_env_seen'),kv.get('ig_refreshed_at')]);
    if(envTok&&envTok!==seen){                          // token nuevo pegado por el dueño del sitio
      const now=Date.now();
      await Promise.all([kv.put('ig_token',envTok),kv.put('ig_env_seen',envTok),kv.put('ig_refreshed_at',String(now))]);
      return {token:envTok,refreshedAt:now,kv};
    }
    if(stored) return {token:stored,refreshedAt:Number(at)||0,kv};
  }catch{/* KV no disponible: se usa la variable de entorno */}
  return {token:envTok,refreshedAt:null,kv:null};
}

/* Renueva el token por otros 60 días y lo guarda en KV (best-effort, nunca rompe la respuesta). */
async function refreshToken({token,kv}){
  try{
    const r=await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    if(!r.ok) return false;
    const d=await r.json();
    if(!d.access_token) return false;
    await Promise.all([kv.put('ig_token',d.access_token),kv.put('ig_refreshed_at',String(Date.now()))]);
    return true;
  }catch{return false}
}

const isoDate=t=>{                                       // "2026-10-05T12:00:00+0000" → ISO válido en todos los navegadores
  if(!t) return '';
  const d=new Date(String(t).replace(/([+-]\d{2})(\d{2})$/,'$1:$2'));
  return isNaN(d)?'':d.toISOString();
};

export async function onRequestGet(context){
  const {request,env}=context;
  const wait=p=>{try{context.waitUntil(p)}catch{}};
  const act=await getToken(env);
  if(!act.token) return json({posts:[],error:'not_configured'},503);

  const qs=new URL(request.url).searchParams;
  const limit=Math.min(Math.max(parseInt(qs.get('limit')||env.INSTAGRAM_LIMIT||'6',10)||6,1),25);
  const afterRaw=qs.get('after')||'';
  const after=/^[A-Za-z0-9_=\-]{1,400}$/.test(afterRaw)?afterRaw:'';          // cursor opaco de la API; cualquier otra cosa se ignora

  const cache=typeof caches!=='undefined'?caches.default:null;
  const cacheKey=new Request(new URL(`/api/instagram?limit=${limit}${after?`&after=${after}`:''}`,request.url).toString());
  if(cache){const hit=await cache.match(cacheKey);if(hit)return hit}

  const url=`${GRAPH}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}${after?`&after=${encodeURIComponent(after)}`:''}&access_token=${encodeURIComponent(act.token)}`;
  let res;
  try{res=await fetch(url)}catch{return json({posts:[],error:'upstream_unreachable'},502)}
  if(!res.ok){
    let code=0;try{code=(await res.json())?.error?.code}catch{}
    return json({posts:[],error:code===190?'token_expired':'upstream_error'},502);   // 190 = token inválido o vencido
  }
  const data=await res.json();
  const posts=(data.data||[])
    .map(p=>({id:p.id,caption:(p.caption||'').slice(0,1200),image:p.thumbnail_url||p.media_url||'',permalink:p.permalink||'',timestamp:isoDate(p.timestamp),type:p.media_type}))
    .filter(p=>p.permalink&&p.image)                    // sin imagen utilizable no se muestra
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const next=data.paging&&data.paging.next&&data.paging.cursors&&data.paging.cursors.after?data.paging.cursors.after:null;
  const out=json({posts,next,fetchedAt:new Date().toISOString()});

  if(cache) wait(cache.put(cacheKey,out.clone()));
  if(act.kv&&act.refreshedAt!==null&&Date.now()-act.refreshedAt>REFRESH_AFTER_MS) wait(refreshToken(act));
  return out;
}
