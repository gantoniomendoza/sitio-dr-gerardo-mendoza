# Sitio del Dr. Gerardo Mendoza Zúñiga

Sitio estático para Cloudflare Pages con una Pages Function (`functions/api/instagram.js`) que alimenta la sección ARTÍCULOS desde Instagram con la API oficial de Meta.

## Despliegue (Cloudflare Pages + GitHub)
- Framework preset: **None** · Build command: **vacío** · Build output directory: **/** (raíz del repositorio)
- La carpeta `functions/` debe estar en la raíz del repositorio.

## Secretos (nunca en el repositorio)
Cloudflare → Workers & Pages → proyecto → Settings → Variables and Secrets:
- `INSTAGRAM_TOKEN` (tipo **Secret**, obligatoria)
- `INSTAGRAM_LIMIT` (opcional, 1–12)
- Binding opcional `IG_KV` (KV) para renovar el token automáticamente.

Para pruebas locales crea un `.dev.vars` con `INSTAGRAM_TOKEN=...` (ya está en `.gitignore`).
