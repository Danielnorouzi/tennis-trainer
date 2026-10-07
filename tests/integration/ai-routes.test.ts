// Integration tests for the AI route pipeline: validation, availability, fixture mode, failure
// mapping, malformed model output, rate limits and budgets. The OpenAI SDK and Supabase auth are
// mocked; everything else (route handler, guards, schemas, post-processing) is the real code.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { analyzeReq } from "../unit/ai-validation.test";

const parseMock = vi.fn();
vi.mock("openai", () => {
  class APIError extends Error {
    constructor(public status: number, message = "upstream") {
      super(message);
      this.name = "APIError";
    }
  }
  class OpenAI {
    static APIError = APIError;
    responses = { parse: parseMock };
  }
  return { default: OpenAI, APIError };
});
vi.mock("openai/helpers/zod", () => ({ zodTextFormat: () => ({ type: "json_schema" }) }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => null, getServerSupabase: async () => null }));

const goodReport = {
  summary: "Solid session.",
  whatWentWell: ["Balanced finishes"],
  observations: [
    {
      id: "o1", category: "legs", strokeIds: ["s1"], finding: "Legs fairly straight", evidence: ["Knee angle 170° at loading"], evidenceType: "measurement",
      whyItMatters: "Base", improvement: "Bend more", drillId: "loaded-legs", priority: "medium", confidence: "medium", timestampStart: 1.2, timestampEnd: 1.6,
    },
  ],
  topPriorities: [{ observationId: "o1", title: "Use your legs", cue: "Sit, then drive" }],
  categoryNotes: [],
  limitations: [],
  inconclusive: [],
  recommendedNextSteps: [],
};

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import(`@/app/api/ai/${path}/route`);
  const req = new NextRequest(`http://localhost/api/ai/${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-rally-guest": "test", ...headers },
  });
  const res = await POST(req);
  return { status: res.status as number, json: await res.json() };
}

beforeEach(async () => {
  vi.resetModules();
  parseMock.mockReset();
  for (const k of ["OPENAI_API_KEY", "AI_MODE", "AI_DAILY_BUDGET_USD_PER_USER", "AI_REQUESTS_PER_10_MIN"]) delete process.env[k];
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ai/report", () => {
  it("rejects invalid JSON and invalid fields with 400", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect((await post("report", "{nope")).status).toBe(400);
    const r = await post("report", { sessionId: 1 });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("invalid_request");
  });

  it("returns 503 (not fake data) when OpenAI is not configured", async () => {
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("ai_unavailable");
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("serves clearly labelled fixtures in explicit test mode", async () => {
    process.env.AI_MODE = "fixture";
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(200);
    expect(r.json.meta.mode).toBe("fixture");
    expect(r.json.data.summary).toMatch(/Test mode/);
  });

  it("refuses fixture mode in production", async () => {
    process.env.AI_MODE = "fixture";
    vi.stubEnv("NODE_ENV", "production");
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(503);
  });

  it("returns a validated, sanitised report from the model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    parseMock.mockResolvedValue({ output_parsed: goodReport, usage: { input_tokens: 1000, output_tokens: 500 }, model: "test-model" });
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(200);
    expect(r.json.meta.mode).toBe("live");
    expect(r.json.data.observations[0].drillId).toBe("loaded-legs");
    expect(r.json.meta.usage.estCostUsd).toBeGreaterThan(0);
    // the API key is never echoed
    expect(JSON.stringify(r.json)).not.toContain("sk-test");
  });

  it("maps a malformed model response to 502", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    parseMock.mockResolvedValue({ output_parsed: { summary: 42 }, usage: {} });
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("malformed_ai_response");
  });

  it("maps upstream outages to safe errors", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { default: OpenAI } = await import("openai");
    parseMock.mockRejectedValue(new (OpenAI as unknown as { APIError: new (s: number) => Error }).APIError(500));
    const r = await post("report", analyzeReq());
    expect(r.status).toBe(502);
    expect(r.json.error.message).not.toMatch(/upstream/);
  });

  it("serves identical requests from cache", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    parseMock.mockResolvedValue({ output_parsed: goodReport, usage: { input_tokens: 10, output_tokens: 10 }, model: "m" });
    await post("report", analyzeReq());
    const second = await post("report", analyzeReq());
    expect(second.json.meta.cached).toBe(true);
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it("rate limits per user", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_REQUESTS_PER_10_MIN = "2";
    parseMock.mockResolvedValue({ output_parsed: goodReport, usage: { input_tokens: 10, output_tokens: 10 }, model: "m" });
    const body = (i: number) => ({ ...analyzeReq(), sessionId: `s${i}` });
    expect((await post("report", body(1), { "x-rally-guest": "rl" })).status).toBe(200);
    expect((await post("report", body(2), { "x-rally-guest": "rl" })).status).toBe(200);
    const third = await post("report", body(3), { "x-rally-guest": "rl" });
    expect(third.status).toBe(429);
    expect(third.json.error.code).toBe("rate_limited");
  });

  it("enforces the daily budget", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_DAILY_BUDGET_USD_PER_USER = "0.000001";
    parseMock.mockResolvedValue({ output_parsed: goodReport, usage: { input_tokens: 100000, output_tokens: 10000 }, model: "m" });
    expect((await post("report", { ...analyzeReq(), sessionId: "b1" }, { "x-rally-guest": "budget" })).status).toBe(200);
    const r = await post("report", { ...analyzeReq(), sessionId: "b2" }, { "x-rally-guest": "budget" });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("budget_user");
  });
});

describe("POST /api/ai/chat", () => {
  it("drops references to sessions the client did not provide", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    parseMock.mockResolvedValue({
      output_parsed: {
        answer: "Your preparation was late in 3 forehands.", details: null, followUps: [], usedSessionData: true,
        references: [{ sessionId: "someone-else", strokeId: null, timestamp: 2, label: "x" }],
      },
      usage: { input_tokens: 10, output_tokens: 10 },
      model: "m",
    });
    const r = await post("chat", {
      player: analyzeReq().player,
      messages: [{ role: "user", content: "Why is my forehand inconsistent?" }],
      context: { sessions: [], goals: [], drillLog: [] },
      detailed: false,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.references).toHaveLength(0);
    expect(r.json.data.usedSessionData).toBe(false);
  });
});

describe("POST /api/ai/realtime", () => {
  it("is unavailable unless explicitly enabled", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const r = await post("realtime", { context: "", experience: "beginner" });
    expect(r.status).toBe(503);
  });
});
