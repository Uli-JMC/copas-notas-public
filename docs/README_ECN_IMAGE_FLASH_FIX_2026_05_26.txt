ECN — Patch público: eliminar flash de imagen incorrecta en Register/Event
Fecha: 2026-05-26

Archivos incluidos:
- copas-notas-public/event.html
- copas-notas-public/js/event.js
- copas-notas-public/css/event.css
- copas-notas-public/js/register.js
- copas-notas-public/css/register.css

Problema corregido:
- En Register se veía primero una imagen fallback/antigua y luego la imagen correcta del evento.
- En Event podía quedar una imagen local inicial mientras cargaba la imagen real de Supabase.

Causa:
- CSS/HTML tenía imágenes fallback visibles antes de que Supabase resolviera el slot correcto.
- JS aplicaba background/src antes de precargar totalmente la imagen final.

Solución:
- Register ya no muestra imagen fallback visible: arranca con fondo neutro oscuro.
- Register precarga la imagen real del slot slide_img antes de aplicarla al card.
- Event usa un pixel transparente inicial en #evPhoto.
- Event precarga la imagen desktop_event/mobile_event antes de cambiar el src.
- Se evita que una carga anterior se aplique encima de una nueva usando tokens de carga.

Después de reemplazar:
- Hacer hard refresh: Cmd + Shift + R.
- Probar Home → Register y Event → Register en móvil.
