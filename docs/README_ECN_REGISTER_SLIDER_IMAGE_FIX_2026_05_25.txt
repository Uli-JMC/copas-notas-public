ECN — Register usa imagen del Home Slider asociada al evento
Fecha: 2026-05-25

Archivos modificados:
- copas-notas-public/js/register.js
- copas-notas-public/css/register.css

Cambios:
1. register.js ahora consulta también el slot slide_img en v_media_bindings_latest.
2. La imagen prioritaria para el hero de Register es:
   slide_img -> mobile_event -> desktop_event -> event_more.
3. La imagen se aplica sobre .cardTop como background optimizado, oscurecido y responsivo.
4. En móvil se ajusta el alto y el background-position para evitar que se vea cortada/desordenada.
5. No se cambia BD, admin, home, event ni Supabase.

Uso:
- Reemplazar estos dos archivos en copas-notas-public/.
- Hacer hard refresh: Cmd + Shift + R.
- Probar entrando a register desde un evento que tenga slot slide_img asignado.
