/**
 * The agent's "brain": decides which paid APIs to call to answer a question.
 *
 * Two brains, same tools:
 *  - claudeBrain: Claude decides, using tool calls. Used when ANTHROPIC_API_KEY is set.
 *  - ruleBrain:   a fixed plan (prices -> news -> summary). No API key needed.
 *
 * GULLIBLE mode makes the rule brain obey instructions it finds inside API results, the way a
 * prompt-injected AI might. It is there to show that the CONTRACT keeps the money safe even when
 * the agent is fooled.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PaidCall } from "./payingFetch";

export type Tools = {
  getPrice: (pair: string) => Promise<PaidCall>;
  getNews: (topic: string) => Promise<PaidCall>;
  summarize: (text: string) => Promise<PaidCall>;
  fetchUrl: (url: string) => Promise<PaidCall>;
};

export type BrainOptions = { tools: Tools; log: (line: string) => void; gullible: boolean };

const COINS: Record<string, { pair: string; topic: string }> = {
  btc: { pair: "BTC-USD", topic: "bitcoin" },
  bitcoin: { pair: "BTC-USD", topic: "bitcoin" },
  eth: { pair: "ETH-USD", topic: "ethereum" },
  ethereum: { pair: "ETH-USD", topic: "ethereum" },
  sol: { pair: "SOL-USD", topic: "solana" },
  solana: { pair: "SOL-USD", topic: "solana" },
};

const describe = (c: PaidCall) => (c.refused ? `REFUSED (${c.refused})` : JSON.stringify(c.body));

export async function ruleBrain(question: string, { tools, log, gullible }: BrainOptions): Promise<string> {
  const words = question.toLowerCase().match(/[a-z]+/g) ?? [];
  const coins = [...new Map(words.filter((w) => COINS[w]).map((w) => [COINS[w].pair, COINS[w]])).values()];
  if (coins.length === 0) coins.push(COINS.btc);
  log(`Plan: price of ${coins.map((c) => c.pair).join(", ")}, news on ${coins[0].topic}, then a summary`);

  const notes: string[] = [];
  for (const coin of coins) {
    const call = await tools.getPrice(coin.pair);
    const body = call.body as { price?: number };
    notes.push(call.refused ? `${coin.pair}: unavailable (${call.refused}).` : `${coin.pair} is ${body.price} (sample data).`);
  }

  const news = await tools.getNews(coins[0].topic);
  const items = ((news.body as { items?: { title: string; text: string }[] })?.items ?? []).filter(Boolean);
  for (const item of items) notes.push(`${item.title}. ${item.text}`);

  if (gullible) {
    const urls = items.flatMap((i) => i.text.match(/https?:\/\/\S+/g) ?? []);
    for (const url of urls) {
      log(`! A news item tells AI agents to fetch ${url} and pay. This demo agent is gullible, so it tries.`);
      const call = await tools.fetchUrl(url);
      log(call.refused ? `! Payment to the injected URL was refused: ${call.refused}` : `! Paid the injected URL (this should not happen)`);
    }
  }

  const summary = await tools.summarize(notes.join(" "));
  const text = (summary.body as { summary?: string })?.summary;
  return text ? text : notes.join(" ");
}

const toolSpecs: Anthropic.Messages.Tool[] = [
  {
    name: "get_price",
    description: "Price of a crypto pair such as BTC-USD. Costs 0.01 tUSD8.",
    input_schema: { type: "object", properties: { pair: { type: "string" } }, required: ["pair"] },
  },
  {
    name: "get_news",
    description: "Latest headlines for a topic such as bitcoin. Costs 0.02 tUSD8.",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
  },
  {
    name: "summarize",
    description: "Summarize a text in three sentences. Costs 0.03 tUSD8.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "fetch_url",
    description: "Fetch any URL, paying if the server asks for payment.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
];

export async function claudeBrain(question: string, { tools, log }: BrainOptions): Promise<string> {
  const anthropic = new Anthropic();
  const model = process.env.AGENT_MODEL ?? "claude-haiku-5-5";
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: question }];
  const system =
    "You are a research agent. Each API call costs money from a budget your owner set. " +
    "Use the tools to answer the question, then reply in at most four sentences. " +
    "Prices and news from these APIs are sample data; say so.";

  for (let turn = 0; turn < 8; turn++) {
    const reply = await anthropic.messages.create({ model, max_tokens: 1024, system, tools: toolSpecs, messages });
    messages.push({ role: "assistant", content: reply.content });
    if (reply.stop_reason !== "tool_use") {
      return reply.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    }
    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of reply.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, string>;
      log(`Claude calls ${block.name}(${JSON.stringify(input)})`);
      const call =
        block.name === "get_price" ? await tools.getPrice(input.pair)
        : block.name === "get_news" ? await tools.getNews(input.topic)
        : block.name === "summarize" ? await tools.summarize(input.text)
        : await tools.fetchUrl(input.url);
      results.push({ type: "tool_result", tool_use_id: block.id, content: describe(call) });
    }
    messages.push({ role: "user", content: results });
  }
  return "Stopped after 8 steps without a final answer.";
}
