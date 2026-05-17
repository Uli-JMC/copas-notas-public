ECN — Hotfix WhatsApp comprobante: nombre del registrante

Archivos modificados:
- copas-notas-public/js/confirm.js
- copas-notas-public/js/register.js

Qué corrige:
- El mensaje de WhatsApp ya no debe decir "Nombre no indicado" después de una inscripción nueva.
- register.js guarda el nombre en sessionStorage y localStorage.
- El botón Confirmación agrega el nombre y la reservación al querystring:
  confirm.html?...&name=...&rn=...
- confirm.js lee el nombre desde querystring, sessionStorage o localStorage.
- También lee la reservación desde querystring, sessionStorage o localStorage.

Notas:
- No cambia BD.
- No toca admin.
- No cambia Supabase.
- Para probar correctamente, realizar una inscripción nueva después de reemplazar los archivos.
- Hacer hard refresh: Cmd + Shift + R.
