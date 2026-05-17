ECN — Confirmación: WhatsApp para comprobante de pago

Archivos modificados:
- copas-notas-public/confirm.html
- copas-notas-public/js/confirm.js
- copas-notas-public/js/register.js

Cambios:
1. El botón de WhatsApp en confirm.html ahora dice "Enviar comprobante".
2. El enlace abre WhatsApp con un mensaje dinámico:
   Hola, le estoy enviando el comprobante de pago para el evento: "NOMBRE DEL EVENTO". Mi nombre es "NOMBRE REGISTRADO". Reservación: "NUMERO DE RESERVACION".
3. register.js guarda el nombre del inscrito en sessionStorage para usarlo en la confirmación.
4. confirm.js usa el nombre guardado, el título del evento y reservation_number.
5. No cambia Supabase ni la estructura de la BD.
6. WhatsApp no permite adjuntar automáticamente el archivo desde un enlace web; el usuario debe adjuntar la imagen/comprobante al abrir el chat.

Después de reemplazar:
- Hacer hard refresh: Cmd + Shift + R
- Probar una inscripción nueva para que sessionStorage incluya el nombre.
