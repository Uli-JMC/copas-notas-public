/* js/supabaseClient.js
   Cliente Supabase (PUBLIC) ✅ PRO
   - Usa publishable key (segura SOLO con RLS + policies)
   - Storage separado del ADMIN (evita choques de sesión)
   - Helpers mínimos (sin lógica de negocio)
*/
(function () {
  "use strict";

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  var SUPABASE_URL = "https://zthwbzaekdqrbpplvkmy.supabase.co";

  // ✅ Publishable key (frontend + RLS)
  var SUPABASE_KEY = "sb_publishable_rYM5ObkmS_YZNkaWGu9HOw_Gr2TN1mu";

  // ✅ Para NO mezclar sesión con el admin:
  // (Admin usa "ecn_admin_sb_auth", acá usamos uno propio)
  var PUBLIC_STORAGE_KEY = "ecn_public_sb_auth";

  function hardFail(msg) {
    try {
      console.error("[supabaseClient][PUBLIC]", msg);
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

  // ------------------------------------------------------------
  // Client
  // ------------------------------------------------------------
  window.APP.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,

      // PUBLIC normalmente puede procesar sesión si algún día usás magic links / OAuth.
      // Si no lo usás, igual no molesta.
      detectSessionInUrl: true,

      // ✅ Storage separado (evita conflictos con admin)
      storageKey: PUBLIC_STORAGE_KEY,
    },
  });

  // Alias corto opcional
  window.APP.sb = window.APP.supabase;

  // Debug mínimo
  window.APP.supabaseUrl = SUPABASE_URL;

  // ------------------------------------------------------------
  // Helpers (no negocio)
  // ------------------------------------------------------------
  window.APP.getSession = async function () {
    try {
      var res = await window.APP.supabase.auth.getSession();
      return res && res.data ? res.data.session : null;
    } catch (_) {
      return null;
    }
  };

  window.APP.getUser = async function () {
    try {
      var res = await window.APP.supabase.auth.getUser();
      return res && res.data ? res.data.user : null;
    } catch (_) {
      return null;
    }
  };
})();
