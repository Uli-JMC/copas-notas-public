import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  console.log("🚀 test-email function started");

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
  console.log("📨 Resend response:", text);

  return new Response("OK");
});
