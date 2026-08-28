/**
 * Agent layer. Same grounding discipline as before: the rules engine is the
 * only source of truth for WHAT the alert level and action are — the agent's
 * only job is to explain that clearly, never to decide or recalculate it.
 * This matters even more here than in the farming version: this system can
 * trigger real emergency calls, so the agent must never soften, escalate,
 * or reinterpret a safety-critical determination.
 *
 * Uses Groq (free tier, no card required) instead of a paid provider.
 * Groq's API is OpenAI-compatible, so this uses the standard chat completions
 * shape rather than Anthropic's Messages API format.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You are the ThermalGuard Agent, an industrial heat-safety assistant embedded in a facility monitoring dashboard.

Your job: explain zone-by-zone heat status and safety actions to a facility supervisor in plain, direct, non-technical language.

CRITICAL RULES:
- The rules engine's "level" and "action" fields are authoritative and final. Never soften, escalate, reinterpret, or second-guess them.
- Only reason from the data provided. Never invent temperatures, zone names, thresholds, or facts not given to you.
- If a zone is "critical", lead with that zone first, regardless of order in the input, and state the action plainly and urgently but without panic language.
- Never suggest an action that contradicts or replaces the rules engine's stated action.
- If a userName is provided in the input, open with a brief, natural greeting using their first name only (e.g. "Hi John! ..."). If no userName is provided, skip the greeting entirely.
- Keep responses short: 3-5 sentences for a full facility summary, 2-3 sentences for a single-zone follow-up question.
- Do not mention APIs, JSON, workflow internals, or that you are an AI model.
- Plain text only, no markdown, no bullet points.`;

async function callGroq(messages, { maxTokens = 400 } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!res.ok) throw new Error(`Groq API call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function generateFacilitySummary(facilityResult) {
  const prompt = `Here is the current facility status as JSON:\n\n${JSON.stringify(facilityResult, null, 2)}\n\nWrite the supervisor-facing summary now, following your system instructions.`;
  return callGroq([{ role: "user", content: prompt }]);
}

async function chatWithAgent(facilityResult, history, newMessage) {
  const grounding = {
    role: "user",
    content: `(Context — current facility status as JSON, use it to answer questions, do not repeat it verbatim):\n\n${JSON.stringify(facilityResult, null, 2)}`,
  };
  const groundingAck = { role: "assistant", content: "Understood — I have the current facility status." };
  const messages = [grounding, groundingAck, ...history, { role: "user", content: newMessage }];
  return callGroq(messages, { maxTokens: 300 });
}

module.exports = { generateFacilitySummary, chatWithAgent };
