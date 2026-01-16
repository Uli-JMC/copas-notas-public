/* js/supabaseClient.js
   Cliente Supabase (PUBLIC)
   - Usamos publishable key (segura con RLS)
   - No mete lógica de negocio aquí
*/
(function () {
  "use strict";

  // ✅ Tu proyecto Supabase
  var SUPABASE_URL = "https://zthwbzaekdqrbpplvkmy.supabase.co";

  // ✅ Publishable key (recomendada para frontend con RLS)
  var SUPABASE_KEY = "sb_publishable_rYM5ObkmS_YZNkaWGu9HOw_Gr2TN1mu";

  function hardFail(msg) {
    try {
      console.error(msg);
    } catch (_) {}
  }

  // Requiere que el CDN de supabase-js esté cargado antes:
  // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  if (!window.supabase || !window.supabase.createClient) {
    hardFail("Supabase CDN no cargado. Agregá supabase-js@2 antes de supabaseClient.js");
    return;
  }

  // Evita doble inicialización si se incluye 2 veces
  if (window.APP && window.APP.supabase) return;

  window.APP = window.APP || {};

  // Cliente
  window.APP.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Helpers opcionales (debug)
  window.APP.supabaseUrl = SUPABASE_URL;

})();
