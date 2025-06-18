// Cloudflare Worker con cron cada 12hs
// Envía eventos de conversión (offline) a Meta API para "Ver contenido", "Completar registro" y "Comprar"

export interface Env {
  DB: D1Database;
}

const META_API_URL = "https://graph.facebook.com/v19.0";
const ACCESS_TOKEN =
  "EAAOqhwo5SCMBOZBcm5TFMEtZBRiOKZCqr6FB5kJRpWxz7ZAnUqOInbN3i8jXfkXm2FGVb4GrfRwwE9MZA4x03435GGZCoTN0HXysFYXG399yMp5JnTAqBZCZC43olvf8dJ2gjzKPOGW0gpyLIJh3fPDvmZAkQFZAZCFnzlWEuvGDmZAvPHf2R5EWYzksEoVlmsLbfjZB5VgZDZD"; // Reemplazar
const EVENT_SET_ID = "1382171666374973"; // Reemplazar

function toUnixTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { results } = await env.DB.prepare(
      `
      SELECT * FROM Leads WHERE updated_at >= datetime('now', '-12 hours')
    `
    ).all();

    if (!results.length) return;

    const events = results.flatMap((row) => {
      const baseEvent = {
        event_time: toUnixTimestamp(row.updated_at),
        action_source: "website",
        event_source_url: "https://tusitio.com", // Reemplazar si querés
        match_keys: {
          fbc: row.fbclid
            ? `fb.1.${Math.floor(Date.now() / 1000)}.${row.fbclid}`
            : undefined,
          ph: row.phone_number || undefined,
          external_id: row.conversion_id || undefined,
          client_user_agent: row.user_agent || undefined,
          client_ip_address: undefined, // Podés incluirla si la almacenás
        },
        custom_data: {
          business_name: row.business_name || "",
          recharges: row.recharges || 0,
        },
      };

      const out: any[] = [];

      // Ver contenido (al ingresar)
      if (row.created_at === row.updated_at) {
        out.push({ ...baseEvent, event_name: "ViewContent" });
      }

      // Completar registro (conversion === 1)
      if (row.conversion === 1) {
        out.push({ ...baseEvent, event_name: "CompleteRegistration" });
      }

      // Comprar (recharges > 0)
      if (row.recharges > 0) {
        out.push({
          ...baseEvent,
          event_name: "Purchase",
          custom_data: {
            ...baseEvent.custom_data,
            value: row.recharges * 1000, // Ejemplo de valor estimado, ajustar
            currency: "ARS",
          },
        });
      }

      return out;
    });

    if (!events.length) return;

    const payload = { data: events };

    const res = await fetch(
      `${META_API_URL}/${EVENT_SET_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const responseJson = await res.json();
    console.log("Meta API response:", responseJson);
  },
};
