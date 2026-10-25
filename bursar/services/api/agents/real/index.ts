// Real mode (DEMO=false): five LLM agents on the Anthropic API, run by the orchestrator. Server-only.
export { runRealNegotiation, type RealDeps, type RealNegotiation } from "./orchestrator.ts";
export { llmFromEnv, AgentError, type AgentCall, type AgentName, type Llm } from "./llm.ts";
export type { StoryClose } from "./storyteller.ts";
