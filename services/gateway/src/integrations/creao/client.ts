// Creao API Trigger client. Docs: https://docs.creao.ai/pro/api-trigger and
// https://community.creao.ai/CalHacks2026/tech. Runs are async: start one, then poll or take a webhook.
import { setTimeout as sleep } from "node:timers/promises";

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface CreaoArtifact {
  id: string;
  title: string;
  type: string;
  url: string;
}

export interface CreaoResult {
  text?: string;
  chatText?: string;
  artifacts?: CreaoArtifact[];
}

export interface CreaoRun {
  id: string;
  status: RunStatus | string;
  appId?: string;
  appName?: string;
  threadId?: string;
  result?: CreaoResult;
  errorCode?: string;
}

export interface StartRunInput {
  appId: string;
  inputs: Record<string, unknown>;
  webhookUrl?: string;
  threadId?: string;
  // Same key returns the same run instead of starting a new one. 8-128 characters.
  idempotencyKey?: string;
  chatModelId?: string;
}

export interface WaitOptions {
  timeoutMs?: number;
  onStatus?: (status: string, run: CreaoRun) => void;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export class CreaoError extends Error {
  readonly status: number;
  readonly body: string;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, body: string, retryAfterMs?: number) {
    super(message);
    this.name = "CreaoError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

// Rate limits (several runs polling at once hit 429) and server hiccups are worth asking again; fetch
// throws a TypeError when the network drops.
const isTransient = (e: unknown) => (e instanceof CreaoError ? e.status === 429 || e.status >= 500 : e instanceof TypeError);
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

// The run record shape is only partly documented, so accept a wrapped or flat body.
function toRun(raw: any): CreaoRun {
  const r = raw?.run ?? raw?.data ?? raw;
  return { ...r, id: r?.id ?? r?.runId, status: r?.status ?? "unknown" };
}

export function createCreaoClient(opts: { apiKey: string; baseUrl?: string }) {
  if (!opts.apiKey.startsWith("capi_")) {
    throw new Error("CREAO_API_KEY must be a capi_ key (Settings -> API Keys, or an agent's own page)");
  }
  const base = (opts.baseUrl ?? "https://agent.creao.ai").replace(/\/+$/, "");

  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // Never include request headers in errors: they carry the key.
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
      throw new CreaoError(`Creao ${method} ${path} returned ${res.status}`, res.status, text.slice(0, 500), retryAfterMs);
    }
    return text ? JSON.parse(text) : {};
  }

  async function startRun(input: StartRunInput): Promise<CreaoRun> {
    const key = input.idempotencyKey;
    if (key !== undefined && (key.length < 8 || key.length > 128)) {
      throw new Error(`idempotencyKey must be 8-128 characters, got ${key.length}`);
    }
    // With an idempotency key a retry returns the same run, so a rate-limited start is safe to repeat.
    for (let attempt = 1; ; attempt++) {
      try {
        return toRun(await call("POST", "/api/v1/runs", input));
      } catch (e) {
        if (key === undefined || attempt >= 4 || !isTransient(e)) throw e;
        await sleep(Math.max(jitter(2_000 * attempt), (e as CreaoError).retryAfterMs ?? 0));
      }
    }
  }

  async function getRun(runId: string): Promise<CreaoRun> {
    return toRun(await call("GET", `/api/v1/runs/${encodeURIComponent(runId)}`));
  }

  async function cancelRun(runId: string): Promise<CreaoRun> {
    return toRun(await call("POST", `/api/v1/runs/${encodeURIComponent(runId)}/cancel`));
  }

  async function listRuns(params: { status?: string; limit?: number; offset?: number } = {}): Promise<any> {
    const qs = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    ).toString();
    return call("GET", `/api/v1/runs${qs ? `?${qs}` : ""}`);
  }

  // Poll until the run ends. Webhooks are best-effort, so this is also the fallback for them.
  async function waitForRun(runId: string, wait: WaitOptions = {}): Promise<CreaoRun> {
    const deadline = Date.now() + (wait.timeoutMs ?? 15 * 60_000);
    let delay = 2_000;
    let last = "";
    for (;;) {
      let run: CreaoRun;
      try {
        run = await getRun(runId);
      } catch (e) {
        // A rate limit while polling is not the run failing: wait longer and ask again.
        if (!isTransient(e)) throw e;
        const pause = Math.max(jitter(delay), (e as CreaoError).retryAfterMs ?? 0);
        if (Date.now() + pause > deadline) throw e;
        await sleep(pause);
        delay = Math.min(Math.round(delay * 1.5), 10_000);
        continue;
      }
      if (run.status !== last) {
        last = run.status;
        wait.onStatus?.(run.status, run);
      }
      if (TERMINAL.has(run.status)) return run;
      if (Date.now() + delay > deadline) throw new CreaoError(`Run ${runId} still ${run.status} at timeout`, 408, "");
      await sleep(jitter(delay));
      delay = Math.min(Math.round(delay * 1.5), 10_000);
    }
  }

  async function runAgent(input: StartRunInput, wait: WaitOptions = {}): Promise<CreaoRun> {
    const started = await startRun(input);
    const done = await waitForRun(started.id, wait);
    if (done.status !== "completed") {
      throw new CreaoError(`Run ${done.id} ended ${done.status}${done.errorCode ? ` (${done.errorCode})` : ""}`, 502, "");
    }
    return done;
  }

  // The link redirects to short-lived storage; fetch drops our key on that cross-origin hop.
  async function downloadArtifact(url: string): Promise<string> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
    if (!res.ok) throw new CreaoError(`Creao artifact download returned ${res.status}`, res.status, "");
    return res.text();
  }

  // Saved agents can reshape their output, so look for the JSON contract in the result
  // text (and JSON strings nested in it), then the chat text, then any JSON artifact.
  async function readAgentJson(run: CreaoRun, requiredKey: string): Promise<any> {
    for (const text of [run.result?.text, run.result?.chatText]) {
      const hit = findWithKey(text, requiredKey);
      if (hit) return hit;
    }
    for (const a of run.result?.artifacts ?? []) {
      if (!/json/i.test(a.type) && !/\.json$/i.test(a.id)) continue;
      const hit = findWithKey(await downloadArtifact(a.url), requiredKey);
      if (hit) return hit;
    }
    throw new Error(`no "${requiredKey}" in run ${run.id} text, chat text or JSON artifacts`);
  }

  return { startRun, getRun, cancelRun, listRuns, waitForRun, runAgent, downloadArtifact, readAgentJson };
}

function findWithKey(value: unknown, key: string, depth = 0): any {
  if (depth > 4 || value == null) return undefined;
  if (typeof value === "string") {
    try {
      return findWithKey(extractJson(value), key, depth + 1);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object") return undefined;
  if (key in value) return value;
  for (const v of Object.values(value)) {
    const hit = findWithKey(v, key, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

export type CreaoClient = ReturnType<typeof createCreaoClient>;

// Creao has no JSON output mode, so agents return one fenced json block in their text.
export function extractJson(text: string): any {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) throw new Error("no JSON object in agent output");
  return JSON.parse(candidate);
}
