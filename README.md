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

## v81 — «Mi formación»: presentación automática
- Secuencia al entrar a la sección (~12 s, sin botones ni instrucciones): logo con destello metálico e iluminación → trayectoria en 4 secciones → repliegue hacia el logo, que queda reducido y centrado.
- Si la persona se desplaza o toca el panel, la animación se detiene y la trayectoria queda completa con desplazamiento normal. Al volver a la sección solo se reproduce el logo (versión breve). Tocar el logo repite la secuencia.
- `prefers-reduced-motion`: se muestra la trayectoria completa sin animación.
- Datos: solo los existentes (TESORO / CINTA). Pendientes de revisión (atributo `data-pendiente` en el HTML): congresos, cursos y talleres, formación técnica y EMC; trabajos presentados y ponencias; confirmar el tipo de afiliación de CMOT y otras membresías verificables. Las secciones sin datos muestran «Información en actualización».
- Se retiraron de Mi formación: botón «Cerrar», pista «Desliza para explorar», rótulo «Mi formación» temporal y píldora «Desliza a la siguiente página». La barra horizontal se conserva.

## v82 — logos de sociedades en la secuencia
- CMOT, FEMECOT e ISAKOS aparecen automáticamente (fila horizontal, entrada escalonada) justo después del logo personal y antes de las cuatro secciones. Usan los archivos originales ya incluidos en el proyecto, sin alterarlos.
- La barra horizontal de actividad académica se conserva independiente.

## v83 — bienvenida, logos junto a su dato, CMOT transparente
- La intro del logo se sustituyó por «Bienvenido» (1 s en total, una vez por visita, sin logo ni video; se omite con movimiento reducido). La portada ya está montada debajo, sin pantalla vacía.
- Se eliminó la fila superior de logos. Cada logo va a la izquierda de su dato (IPN/ESM, IMSS/UAQ, ABC/OrtoMove, FEMECOT, ISAKOS, CMOT); en pantallas < 340 px se apila. Tamaño según proporción original.
- CMOT: el rectángulo venía de la propia imagen (PNG blanco sobre fondo oscuro, no del CSS). Se genera transparencia real por luminosidad y el trazo se pinta en carbón #0F1419 (el original es blanco, no sirve sobre marfil). Si hay una versión oficial a color con fondo transparente, sustituir `LOGO_DATA.cmot`.

## v84 — sin pantalla de bienvenida
- Se eliminó por completo la pantalla «Bienvenido» (elemento #intro, estilos, `playIntro`/`endIntro`, temporizador y llamada en `render()`). No se recuperó el video del logo.
- La portada aparece con una transición breve (≈0,9 s: fotografía en fundido, textos con ligero ascenso escalonado) solo en la carga inicial, mediante la clase temporal `body.boot` (se retira a los 1,1 s). No se repite al cambiar de sección; con movimiento reducido no hay animación.

## v85 — portada
- Se eliminó únicamente `<p class="areas">Hombro · Rodilla · Cadera · Trauma</p>` de la portada (`.home .info`). Sin otros cambios; las reglas CSS `.areas` quedan sin uso.

## v86 — Mi formación: reinicio determinista y sin barra duplicada
- Se eliminó la barra horizontal giratoria (marcado, JS de la cinta, estilos y animaciones). La información de CMOT, FEMECOT e ISAKOS vive solo en el menú de Mi formación.
- Cada entrada a la sección reinicia la secuencia desde la fase A (logo, ~17 % más rápida con los mismos efectos), pasa a la fase B (el logo sube y la trayectoria se integra) y termina en la fase C: menú completo con desplazamiento vertical, sin tocar nada. `render()` llama a `root._enter()` en cada entrada; `root._reset()` cancela temporizadores y limpia estados al salir. Ya no hay versión «breve», repliegue ni estado de botón (el logo dejó de ser un `<button>`).
- Si la persona interactúa durante la fase B, el menú completo aparece de inmediato.
