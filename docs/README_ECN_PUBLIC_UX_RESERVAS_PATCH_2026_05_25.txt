# ECN Public UX / Reservas Patch — 2026-05-25

Este ZIP contiene únicamente archivos públicos modificados. No toca admin, no toca Supabase y no cambia la base de datos.

## Archivos incluidos

- copas-notas-public/js/home.js
- copas-notas-public/js/event.js
- copas-notas-public/js/register.js
- copas-notas-public/css/home.css
- copas-notas-public/css/event.css
- copas-notas-public/css/register.css

## Cambios aplicados

### 1. Register usa la imagen real del evento
La cabecera de `register.html` ahora toma dinámicamente la imagen asignada al evento:
- mobile_event en móvil
- desktop_event en desktop

La imagen se aplica oscurecida como fondo de la card de inscripción, sin cambiar el HTML ni la BD.

### 2. Botón “Ver más” del slide lleva al mes correcto
En Home, el botón `Ver más` del slide ya no solo baja a “Próximos eventos”.
Ahora:
- detecta el `month_key` del evento del slide,
- selecciona ese mes,
- baja a la sección `#proximos`,
- aplica estado visual distintivo al mes activo.

También se soporta navegación externa:
`home.html?month=JUNIO#proximos`

### 3. Cupos más actualizados
Se agregaron refrescos automáticos en:
- Home
- Event
- Register

Incluye:
- refresh al volver a la pestaña,
- refresh al hacer focus,
- polling ligero,
- canal Realtime de Supabase si está disponible.

Además, Register refresca cupos justo antes de llamar la RPC `register_for_event`.

### 4. Modal de éxito en Register
- Botón `Volver al evento` redirige a `event.html?event=...`.
- La X cierra solo el modal.
- Al cerrar con X, overlay o ESC, el formulario queda reactivado y el botón vuelve a `Inscribirme`.

### 5. Menos flash de imágenes al pasar entre Register/Event
Event ahora espera a que la imagen correcta cargue antes de mostrarla visualmente, evitando que se note una imagen vieja o de fallback.

### 6. Ver otros eventos desde Event
`Ver otros eventos` ahora apunta a:
`home.html?month=MES_DEL_EVENTO#proximos`

Así el usuario vuelve directamente al mes correcto del evento.

## Validación
Los JS fueron validados con:
- node --check home.js
- node --check event.js
- node --check register.js

Después de reemplazar, hacer hard refresh:
Cmd + Shift + R

## Nota
Para que el refresh “en tiempo real” sea instantáneo, Supabase Realtime debe estar habilitado para `event_dates`.
Si no está habilitado, el fallback de focus/visibility/polling mantiene los cupos actualizados sin romper el sitio.
