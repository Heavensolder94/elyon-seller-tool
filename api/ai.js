import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_BY_TASK = {
  category: "gpt-4.1-nano",
  tags: "gpt-4.1-nano",
  title: "gpt-4.1-mini",
  description: "gpt-4.1-mini",
  product_score: "gpt-4.1-mini",
  assistant: "gpt-4.1-mini",
};

function chooseModel(task) {
  return MODEL_BY_TASK[task] || "gpt-4.1-mini";
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
