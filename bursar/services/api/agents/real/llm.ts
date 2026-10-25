// One structured call to Claude for a real-mode agent. The agent answers through a single strict tool whose input
// schema is the agent's output schema; the tool input is validated with zod and the agent's own rules. If anything is
// wrong, the model sees the problems once and answers again; a second bad answer is an AgentError.
// tool_choice stays "auto" (Sonnet 5.5 rejects forced tool use), so a reply without the tool call also counts as wrong.
// Keys come from the environment through the SDK and are never logged.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type AgentName = "DOC_ANALYST" | "EVIDENCE_RISK_JUDGE" | "VENDOR_STRATEGIST" | "BUYER_NEGOTIATOR" | "STORYTELLER_CLERK";

/** What one agent call cost, for the server log and the negotiation's record. */
export interface AgentCall { agent: AgentName; model: string; ms: number; attempts: number; ok: boolean; problems: string[]; inputTokens: number; outputTokens: number }

export interface Llm {
  client: Anthropic;
  fastModel: string;
  smartModel: string;
  onCall?: (c: AgentCall) => void;
}

export class AgentError extends Error {
  constructor(readonly agent: AgentName, message: string) {
    super(`${agent}: ${message}`);
    this.name = "AgentError";
  }
}

export function llmFromEnv(onCall?: (c: AgentCall) => void): Llm {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  return {
    client: new Anthropic({ timeout: 30_000, maxRetries: 2 }),
    fastModel: process.env.FAST_MODEL || "claude-haiku-5-5",
    smartModel: process.env.SMART_MODEL || "claude-sonnet-5-5",
    onCall,
  };
}

// Models that accept the server-side refusal fallback ("default" routes by refusal category).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

// Thinking off where a model allows it (at low effort), for the per-turn latency target: each agent fills in one small
// schema from facts it's handed. Haiku 5.5 and Opus 5 take "disabled"; Sonnet 5.5 rejects that and takes "between_tools".
// Any other model keeps its default.
const THINKING_OFF: Record<string, Anthropic.Beta.BetaThinkingConfigParam> = {
  "claude-haiku-5-5": { type: "disabled" },
  "claude-sonnet-5-5": { type: "between_tools" },
  "claude-opus-5": { type: "disabled" },
};

// Strict tool schemas take no numeric, length or array-size constraints; zod still checks them after the call.
const DROP = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
  "pattern", "minItems", "maxItems", "uniqueItems", "default", "format"]);

/** A zod schema as a strict tool input schema: every object closed, every property required (optionals are T | null). */
export function strictSchema(schema: z.ZodType): Record<string, unknown> {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== "object") return x;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (!DROP.has(k)) out[k] = walk(v);
    if (out.type === "object" || out.properties) {
      out.additionalProperties = false;
      out.required = Object.keys((out.properties as object | undefined) ?? {});
    }
    return out;
  };
  return walk(z.toJSONSchema(schema)) as Record<string, unknown>;
}

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);

export interface AgentSpec<T> {
  agent: AgentName;
  model: "fast" | "smart";
  system: string;
  tool: { name: string; description: string };
  schema: z.ZodType<T>;
  input: unknown;
  /** Rules zod can't express (citations in the log, caps, word counts). Returns the problems, empty when the answer is usable. */
  check?: (out: T) => string[];
  maxTokens?: number;
}

export async function callAgent<T>(llm: Llm, spec: AgentSpec<T>): Promise<T> {
  const model = spec.model === "fast" ? llm.fastModel : llm.smartModel;
  const tool = { name: spec.tool.name, description: spec.tool.description, strict: true, input_schema: strictSchema(spec.schema) as Anthropic.Beta.BetaTool.InputSchema };
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: JSON.stringify(spec.input) }];
  const started = performance.now();
  let problems: string[] = [];
  const rejected: string[] = []; // every attempt's problems, so a retry that succeeded still shows what it fixed
  let inputTokens = 0, outputTokens = 0;
  const record = (attempts: number, ok: boolean) =>
    llm.onCall?.({ agent: spec.agent, model, ms: Math.round(performance.now() - started), attempts, ok, problems: rejected, inputTokens, outputTokens });

  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await llm.client.beta.messages.create({
        model,
        max_tokens: spec.maxTokens ?? 2048,
        system: [{ type: "text", text: spec.system, cache_control: { type: "ephemeral" } }],
        tools: [tool],
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        output_config: { effort: "low" },
        ...(THINKING_OFF[model] ? { thinking: THINKING_OFF[model] } : {}),
        messages,
        ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (e) {
      problems = [`API error: ${e instanceof Anthropic.APIError ? `${e.status ?? "network"} ${e.message}` : (e as Error).message}`];
      rejected.push(...problems);
      record(attempt, false);
      throw new AgentError(spec.agent, problems[0]);
    }
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === tool.name);
    if (!call) problems = [`no ${tool.name} call (stop_reason ${res.stop_reason})`];
    else {
      const parsed = spec.schema.safeParse(call.input);
      problems = parsed.success ? spec.check?.(parsed.data) ?? [] : issues(parsed.error);
      if (!problems.length) {
        record(attempt, true);
        return (parsed as { data: T }).data;
      }
    }
    rejected.push(...problems.map((p) => `try ${attempt}: ${p}`));
    if (attempt === 2) break;
    messages.push({ role: "assistant", content: res.content });
    messages.push(call
      ? { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true,
          content: `Rejected: ${problems.join("; ")}. Call ${tool.name} again with your complete answer, every field included, corrected.` }] }
      : { role: "user", content: `Answer by calling the ${tool.name} tool exactly once.` });
  }
  record(2, false);
  throw new AgentError(spec.agent, problems.join("; "));
}
