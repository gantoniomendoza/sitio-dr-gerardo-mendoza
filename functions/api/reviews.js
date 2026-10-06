/**
 * Cloudflare Pages Function — GET /api/reviews   (RESERVADO: aún no implementado)
 *
 * Aquí se conectará, de forma oficial, Google Business Profile (o Google Places API) cuando exista el perfil.
 * Contrato previsto para el frontend (CONFIG.reviewsEndpoint en index.html):
 *   { reviews:[{ author, rating, text, date, source:'google' }] }   // el frontend destaca solo rating >= 4
 * Las credenciales irán únicamente como variables de entorno de este backend.
 */
export async function onRequestGet(){
  return new Response(JSON.stringify({reviews:[],error:'not_configured'}),{status:501,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
