/**
 * Agent loop: give Claude one discrepant SKU and the tools; let it call tools
 * until it calls report_finding. Returns the structured finding.
 */
import Anthropic from "@anthropic-ai/sdk";
import { handlers, tools, type Cause } from "./tools";

let client: Anthropic | undefined; // created on first use; reads ANTHROPIC_API_KEY
const MODEL = process.env.MODEL ?? "claude-sonnet-5-5";
const MAX_TURNS = 10;

export type Finding = {
  sku: string; cause: Cause; confidence: "high" | "medium" | "low";
  explanation: string; recommended_action: string; evidence: string[];
};

const SYSTEM = `You investigate stock discrepancies for a small UK grocery store.
Expected stock = opening count + deliveries received - till sales - recorded wastage.
A discrepancy means the closing count differs from expected.
Use the tools to gather facts before deciding. Possible causes:
- shrinkage: stock disappears gradually with no paperwork explanation (often theft of small, valuable items)
- missed_delivery: a delivery was booked in but never physically arrived (missing amount matches one delivery)
- scanning_error: the till recorded sales against a look-alike product (one product short, its look-alike has the same amount extra)
- unrecorded_wastage: perishable stock thrown away without being written off
- double_counted_delivery: the same delivery note was booked in twice
Finish by calling report_finding exactly once. Write for a store manager in plain English.`;

export async function investigate(sku: string): Promise<{ finding: Finding; toolCalls: string[] }> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Investigate the stock discrepancy for product ${sku}.` },
  ];
  const toolCalls: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    client ??= new Anthropic();
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools, messages });
    messages.push({ role: "assistant", content: res.content });

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const final = uses.find((u) => u.name === "report_finding");
    if (final) return { finding: final.input as Finding, toolCalls };
    if (uses.length === 0) {
      messages.push({ role: "user", content: "Please finish by calling report_finding." });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      toolCalls.push(u.name);
      const handler = handlers[u.name];
      const output = handler ? await handler(u.input as { sku: string }) : { error: `unknown tool ${u.name}` };
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(output) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(`No finding for ${sku} after ${MAX_TURNS} turns`);
}
