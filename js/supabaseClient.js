/* js/supabaseClient.js
   Cliente Supabase (PUBLIC) ✅ PRO (depurado)
   - Usa publishable key (segura SOLO con RLS + policies)
   - Storage separado del ADMIN (evita choques de sesión)
   - Helpers mínimos (sin lógica de negocio)
   - ✅ Incluye APP.isAdmin() (gate) requerido por admin-auth.js
*/
(function () {
  "use strict";

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  var SUPABASE_URL = "https://zthwbzaekdqrbpplvkmy.supabase.co";

  // ✅ Publishable key (frontend + RLS)
  var SUPABASE_KEY = "sb_publishable_rYM5ObkmS_YZNkaWGu9HOw_Gr2TN1mu";

  // ✅ Storage separado (evita conflictos con admin)
  var PUBLIC_STORAGE_KEY = "ecn_public_sb_auth";

  function hardFail(msg) {
    try {
      console.error("[supabaseClient][PUBLIC]", msg);
    } catch (_) {}
  }

  // Requiere CDN supabase-js@2 antes
  if (!window.supabase || !window.supabase.createClient) {
    hardFail("Supabase CDN no cargado. Agregá supabase-js@2 antes de supabaseClient.js");
    return;
  }

  // Namespace
  window.APP = window.APP || {};

  // ------------------------------------------------------------
  // Evitar doble init (pero sin romper ADMIN)
  // - Si ya existe un cliente, no lo sobreescribimos.
  // - Creamos alias estable APP.sb / APP.publicSb
  // ------------------------------------------------------------
  function alreadyInitialized() {
    try {
      // si ya existe un cliente, asumimos que está OK
      // (en admin, también se llama APP.supabase)
      return !!(window.APP && (APP.supabase || APP.sb));
    } catch (_) {
      return false;
    }
  }

  if (!alreadyInitialized()) {
    // Client PUBLIC
    window.APP.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: PUBLIC_STORAGE_KEY
      }
    });

    // Alias corto
    window.APP.sb = window.APP.supabase;
  }

  // Alias explícito para no confundirte cuando haya admin/public juntos
  // (si ya existe APP.supabase por el admin, esto apunta a ese mismo)
  window.APP.publicSb = window.APP.sb || window.APP.supabase;

  // Debug mínimo
  window.APP.supabaseUrl = SUPABASE_URL;

  // ------------------------------------------------------------
  // Helpers (no negocio)
  // ------------------------------------------------------------
  window.APP.getSession = async function () {
    try {
      var client = window.APP.publicSb;
      if (!client || !client.auth || !client.auth.getSession) return null;
      var res = await client.auth.getSession();
      return res && res.data ? res.data.session : null;
    } catch (_) {
      return null;
    }
  };

  window.APP.getUser = async function () {
    try {
      var client = window.APP.publicSb;
      if (!client || !client.auth || !client.auth.getUser) return null;
      var res = await client.auth.getUser();
      return res && res.data ? res.data.user : null;
    } catch (_) {
      return null;
    }
  };

  // Útil para guards (admin-auth.js puede usarlo)
  window.APP.requireSession = async function () {
    var s = await window.APP.getSession();
    return s || null;
  };

  // Logout helper
  window.APP.signOut = async function () {
    try {
      var client = window.APP.publicSb;
      if (!client || !client.auth || !client.auth.signOut) return;
      await client.auth.signOut();
    } catch (_) {}
  };

  // ------------------------------------------------------------
  // ✅ Admin gate helper (requerido por admin-auth.js)
  //   - Usa tabla public.admins (PK: user_id uuid)
  //   - Requiere policy: admins can read own row
  // ------------------------------------------------------------
  window.APP.isAdmin = async function () {
    try {
      var client = window.APP.publicSb;
      if (!client) return false;

      var s = await client.auth.getSession();
      var userId =
        s && s.data && s.data.session && s.data.session.user
          ? s.data.session.user.id
          : "";

      if (!userId) return false;

      var res = await client
        .from("admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (res && res.error) return false;
      return !!(res && res.data && String(res.data.user_id) === String(userId));
    } catch (_) {
      return false;
    }
  };
})();
