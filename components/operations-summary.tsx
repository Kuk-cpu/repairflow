"use client";

import Link from "next/link";
import { Bot, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

type Summary = { headline: string; items: Array<{ ticketId: string; note: string }>; provider: "demo" | "openai" };

export function OperationsSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/ai/operations-summary", { method: "POST", headers: { "Content-Type": "application/json" } });
      const body = await response.json() as { summary?: Summary; error?: string };
      if (!response.ok || !body.summary) throw new Error(body.error ?? "Summary could not be created");
      setSummary(body.summary);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Summary could not be created"); }
    finally { setPending(false); }
  }

  return <section className="operations-summary"><div className="section-heading"><div><h2>Operations draft</h2><p>AI sees only the work orders available to this account.</p></div><button className="button button-secondary" onClick={generate} disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : summary ? <RotateCcw aria-hidden="true" /> : <Bot aria-hidden="true" />}{pending ? "Drafting" : summary ? "Regenerate" : "Draft summary"}</button></div>{error ? <p className="alert error" role="alert">{error} Continue with the database-backed work order list above.</p> : null}{summary ? <div className="summary-output"><div><span className="demo-chip">{summary.provider === "demo" ? "Demo draft" : "AI draft"}</span><strong>{summary.headline}</strong></div><ul>{summary.items.map((item) => <li key={item.ticketId}><Link href={`/tickets/${item.ticketId}`}>{item.note}</Link></li>)}</ul><small>Draft wording only. Counts, statuses, and links remain application data.</small></div> : null}</section>;
}
