import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const MODEL_BY_TASK = {
  category: DEFAULT_MODEL,
  tags: DEFAULT_MODEL,
  title: DEFAULT_MODEL,
  description: DEFAULT_MODEL,
  product_score: DEFAULT_MODEL,
  assistant: DEFAULT_MODEL,
};

function chooseModel(task) {
  return MODEL_BY_TASK[task] || DEFAULT_MODEL;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { task, prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Prompt fehlt" });
    }

    const model = chooseModel(task);

    const response = await client.responses.create({
      model,
      input: prompt,
    });

    return res.status(200).json({
      ok: true,
      task,
      modelUsed: model,
      result: response.output_text,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
