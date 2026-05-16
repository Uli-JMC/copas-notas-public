ECN — Event page “Ver más info” modal full screen

Archivos modificados:
- copas-notas-public/event.html
- copas-notas-public/css/event.css
- copas-notas-public/js/event.js

Qué hace:
- El botón “Ver más info” ya no despliega la imagen inline debajo del botón.
- Ahora abre un modal full screen con backdrop oscuro y botón X para cerrar.
- Cierra con:
  - botón X,
  - click fuera del contenido,
  - tecla ESC.
- Usa el mismo slot existente event_more desde v_media_bindings_latest.
- No cambia Supabase.
- No toca admin.
- No cambia registro ni fechas.

Reemplazo:
1. Copiar estos archivos sobre los existentes respetando rutas.
2. Hacer hard refresh: Cmd + Shift + R.
3. Probar en event.html: Ver más info.
