import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function keyInfo(k: string | null) {
  const s = (k ?? "").trim();
  return {
    present: !!s,
    len: s.length,
    prefix: s.slice(0, 3), // esperado: "re_"
    suffix: s.slice(-4),
  };
}

Deno.serve(async () => {
  console.log("🚀 test-email function started");

  const raw = Deno.env.get("RESEND_API_KEY");
  const RESEND_API_KEY = (raw ?? "").trim();

  console.log("🔑 RESEND_API_KEY info:", keyInfo(raw));

  if (!RESEND_API_KEY) {
    console.error("❌ Missing RESEND_API_KEY");
    return new Response("Missing RESEND_API_KEY", { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Entre Copas <onboarding@resend.dev>",
      to: ["umcalderon@gmail.com"],
      subject: "Prueba cero – Edge Function",
      html: `
        <h1>🔥 Funciona</h1>
        <p>Este correo salió directo desde una Edge Function.</p>
        <p>No DB. No triggers. No RLS.</p>
      `,
    }),
  });

  const text = await res.text();

  console.log("📨 Resend status:", res.status);
  console.log("📨 Resend response:", text);

  // Si Resend falla, devolvemos error para que quede clarísimo en invocations/logs
  if (!res.ok) {
    return new Response(`Resend error (${res.status}): ${text}`, { status: 500 });
  }

  return new Response("OK");
});
