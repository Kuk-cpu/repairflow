import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiProvider } from "@/ai/provider";

const original = {
  provider: process.env.AI_PROVIDER,
  key: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  timeout: process.env.AI_TIMEOUT_MS,
};

function useOpenAi() {
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key-not-sent";
  process.env.OPENAI_MODEL = "test-model";
}

afterEach(() => {
  const restore = (name: string, value: string | undefined) => value === undefined ? delete process.env[name] : void (process.env[name] = value);
  restore("AI_PROVIDER", original.provider);
  restore("OPENAI_API_KEY", original.key);
  restore("OPENAI_MODEL", original.model);
  restore("AI_TIMEOUT_MS", original.timeout);
  vi.unstubAllGlobals();
});

describe("OpenAI adapter failure boundaries", () => {
  it("rejects invalid JSON instead of storing an unvalidated draft", async () => {
    useOpenAi();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 })));
    await expect(getAiProvider().extract("Kitchen tap leaks.")).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects structured output that fails the server schema", async () => {
    useOpenAi();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ summary: "Incomplete" }) }), { status: 200 })));
    await expect(getAiProvider().extract("Kitchen tap leaks.")).rejects.toThrow();
  });

  it("aborts a provider request after the configured timeout", async () => {
    useOpenAi();
    process.env.AI_TIMEOUT_MS = "5";
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    await expect(getAiProvider().extract("Kitchen tap leaks.")).rejects.toMatchObject({ name: "AbortError" });
  });
});
