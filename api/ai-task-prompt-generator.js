import { requireSellerAccess } from "../lib/seller-access.js";

function text(value, max = 6000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseJson(content) {
  const raw = text(content, 12000);
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("DeepSeek lieferte kein gültiges JSON.");
}

function sanitizePrompt(value) {
  return text(value, 5000)
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = text(process.env.DEEPSEEK_API_KEY, 1000);
  const model = text(process.env.DEEPSEEK_MODEL || "deepseek-chat", 100);

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/ai-task-prompt-generator",
      provider: "deepseek",
      configured: Boolean(apiKey),
      model: apiKey ? model : null,
      behavior: {
        generatesTextOnly: true,
        startsTask: false,
        executesExternalActions: false,
      },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur GET und POST erlaubt." });
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: "deepseek_not_configured",
      message: "DeepSeek ist im Seller Tool noch nicht serverseitig konfiguriert.",
    });
  }

  const body = object(req.body);
  const notes = text(body.notes, 6000);
  const assignee = text(body.assignee, 160);
  const taskTitle = text(body.taskTitle, 200);
  const workspace = text(body.workspace, 120);

  if (!notes) return res.status(400).json({ ok: false, error: "notes_required", message: "Bitte zuerst Stichpunkte oder einen kurzen Arbeitsauftrag eingeben." });

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.22,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du bist der Prompt-Redakteur des Elyon Seller Tools. Formuliere aus kurzen deutschen Stichpunkten einen klaren, professionellen Arbeitsauftrag für einen virtuellen Mitarbeiter. " +
              "Bewahre Absicht, Umfang, Einschränkungen und Prioritäten des Nutzers. Erfinde keine Produkt-, Markt-, Rechts-, Preis-, Kunden- oder Lieferantendaten und ergänze keine Aufgaben, die aus den Stichpunkten nicht sinnvoll folgen. " +
              "Mache Ziel, relevante Prüfschritte, erwartetes Ergebnis und sinnvolle Stop-/Eskalationsbedingungen eindeutig, aber halte den Auftrag kompakt und praktisch. " +
              "Füge niemals selbstständig Veröffentlichung, Live-Preisänderung, Lieferantenbestellung, Kundennachricht, Erstattung, Löschung oder Änderung rechtlicher Daten hinzu. " +
              "Falls der Nutzer eine solche externe Aktion ausdrücklich erwähnt, formuliere sie nur als Vorbereitung oder als Aktion nach der im Elyon-System erforderlichen Freigabe. " +
              "Keine Meta-Erklärung, keine Begrüßung und keine Aussage darüber, dass du den Prompt verbessert hast. Antworte ausschließlich als JSON mit dem Feld prompt.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "expand_task_notes_to_work_instruction",
              locale: "de-DE",
              assignee: assignee || null,
              taskTitle: taskTitle || null,
              workspace: workspace || null,
              notes,
              output: {
                format: "plain_work_instruction",
                language: "de",
                targetLength: "ca. 500-1800 Zeichen, bei sehr einfachen Aufgaben kürzer",
                preserveUserIntent: true,
              },
            }),
          },
        ],
      }),
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "deepseek_request_failed",
        message: data?.error?.message || data?.message || data?.raw || `HTTP ${response.status}`,
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ ok: false, error: "deepseek_empty_response", message: "DeepSeek hat keinen Arbeitsauftrag geliefert." });
    const parsed = parseJson(content);
    const prompt = sanitizePrompt(parsed?.prompt);
    if (!prompt) return res.status(502).json({ ok: false, error: "deepseek_empty_prompt", message: "DeepSeek hat keinen verwertbaren Aufgaben-Prompt geliefert." });

    return res.status(200).json({
      ok: true,
      prompt,
      provider: "deepseek",
      model,
      usage: data.usage || null,
      safety: {
        taskStarted: false,
        externalActionExecuted: false,
        manualReviewRequired: true,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "task_prompt_generation_failed",
      message: error?.message || "Der Arbeitsauftrag konnte nicht generiert werden.",
    });
  }
}
