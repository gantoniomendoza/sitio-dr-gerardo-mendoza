# Sitio del Dr. Gerardo Mendoza Zúñiga

Sitio estático para Cloudflare Pages con una Pages Function (`functions/api/instagram.js`) que alimenta la sección ARTÍCULOS desde Instagram con la API oficial de Meta (feed vertical con paginación real por cursor `after`) y otra (`functions/api/reviews.js`) para las reseñas de Google de la sección PACIENTES (solo 4–5 ★, de la más reciente a la más antigua, también paginada).

## Despliegue (Cloudflare Pages + GitHub)
- Framework preset: **None** · Build command: **vacío** · Build output directory: **/** (raíz del repositorio)
- La carpeta `functions/` debe estar en la raíz del repositorio.

## Secretos (nunca en el repositorio)
Cloudflare → Workers & Pages → proyecto → Settings → Variables and Secrets:
- `INSTAGRAM_TOKEN` (tipo **Secret**, obligatoria)
- `INSTAGRAM_LIMIT` (opcional, 1–12)
- Binding opcional `IG_KV` (KV) para renovar el token automáticamente.

Para pruebas locales crea un `.dev.vars` con `INSTAGRAM_TOKEN=...` (ya está en `.gitignore`).

## Reseñas de Google (`/api/reviews`) — variables en Cloudflare, nunca en el repositorio
Proveedor A (recomendado, paginado): Google Business Profile API
- `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` (Secret) · `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`

Proveedor B (sin paginación; Google entrega como máximo 5 reseñas por lugar): Places API (New)
- `GOOGLE_PLACES_KEY` (Secret) · `GOOGLE_PLACE_ID`

Sin variables, la sección muestra un estado vacío discreto: no se inventa contenido.
