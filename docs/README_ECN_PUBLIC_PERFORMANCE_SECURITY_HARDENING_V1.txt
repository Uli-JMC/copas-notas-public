ECN_public_performance_security_hardening_v1

Archivos incluidos:
- copas-notas-public/register.html
- copas-notas-public/js/register.js
- copas-notas-public/css/register.css
- copas-notas-admin/js/admin-media.js
- sql/optional_rls_hardening_media_menu.sql

Cambios aplicados:
1) register.html
- Corrige HTML inválido: el modal de éxito ahora está dentro de <body>.
- Agrega <img id="registerHeroImg" fetchpriority="high" decoding="async"> dentro del hero de registro.
- Mantiene IDs existentes y funcionalidad actual.

2) register.js
- El hero de Register deja de depender solo de background-image dinámico.
- Usa imagen real <img>, con preload/warm payload y control de carga.
- Mantiene la prioridad de imagen: slide_img > mobile_event > desktop_event > event_more.
- Agrega refresh de cupos en Register:
  - focus
  - visibilitychange
  - polling ligero cada 25s
  - realtime de event_dates si Supabase Realtime está disponible
- Antes de enviar reserva, refresca cupos desde Supabase y luego llama al RPC.

3) register.css
- Estilos para .registerHeroImg y .registerHeroOverlay.
- El contenido queda sobre la imagen con z-index correcto.
- La imagen se ajusta al espacio con object-fit: cover.

4) admin-media.js
- Valida archivos antes de subir a Storage.
- Bucket media: jpg, jpeg, png, webp, avif; máximo 8 MB.
- Bucket video: mp4, webm, mov; máximo 50 MB.
- Mantiene toda la funcionalidad existente.

5) sql/optional_rls_hardening_media_menu.sql
- Opcional. Sirve para cerrar escritura de media_assets, media_bindings y menu_items solo a admins.
- No ejecutar si querés que cualquier usuario autenticado pueda administrar esos módulos.

Validaciones realizadas:
- node --check copas-notas-public/js/register.js: OK
- node --check copas-notas-admin/js/admin-media.js: OK
- register.html: modal dentro de body y registerHeroImg presente.

Recomendación de deploy:
- No subir .git, __MACOSX, .DS_Store ni .env.local.
- Optimizar imágenes en Supabase: WebP/JPG móvil 250–450 KB y desktop 300–700 KB.
- Probar Home -> Register, Event -> Register, y refresh de cupos en dos pestañas.
