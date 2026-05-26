ECN Public Image Performance Warmup — 2026-05-26

Objetivo:
Reducir al mínimo el tiempo en negro al navegar Home/Event → Register/Event, sin volver a mostrar imágenes fallback incorrectas.

Archivos incluidos:
- copas-notas-public/js/home.js
- copas-notas-public/js/event.js
- copas-notas-public/js/register.js
- copas-notas-public/css/register.css
- copas-notas-public/css/event.css

Cambios principales:
1. Home ahora precarga la imagen del evento antes de navegar.
   - Al hacer hover/touch/click sobre Inscribirme o Más info, guarda un payload por event_id en sessionStorage.
   - También dispara preload de la imagen correcta.

2. Register pinta la imagen correcta inmediatamente si viene desde Home/Event.
   - Lee sessionStorage con la clave ecn:warm:event:<eventId>.
   - Usa primero registerHero/slide_img.
   - Pinta título, descripción y cupos con datos precargados mientras Supabase responde.
   - Después Supabase refresca y confirma los datos reales.

3. Event también aprovecha el payload precargado.
   - Si se entra desde Home, pinta el hero correcto antes de terminar el fetch de Supabase.

4. Se mantiene el fix anterior:
   - No hay fallback visible viejo.
   - Si no existe payload precargado, queda skeleton oscuro hasta que llegue Supabase.

Notas:
- La carga “instantánea” depende de la red y del peso real de la imagen en Supabase Storage.
- Este patch hace prewarm/preload para que al llegar a Register/Event la imagen ya esté descargándose o cacheada.
- Recomendación futura: subir versiones webp/jpg optimizadas para móvil, idealmente menores a 250–450 KB para el hero móvil.

Validación:
- node --check OK en home.js, event.js y register.js.

Después de reemplazar:
- Hacer Cmd + Shift + R.
- Probar en móvil: Home → Inscribirme.
