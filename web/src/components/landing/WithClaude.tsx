import Link from "next/link";

const TX = "0x55dffae334e71555e84f7600a5fb657f37fa55e8853932734ba8c5ab5e35e1ad";
const API = "agentmeter-api-7uum.onrender.com";

type Turn =
  | { who: "you"; text: string }
  | { who: "claude"; text: string }
  | { who: "tool"; name: string; args: string; out: string; tone?: "paid" | "refused" };

/** An example session: the tool outputs use the MCP server's real wording and a real testnet payment. */
const TURNS: Turn[] = [
  { who: "you", text: "What's bitcoin trading at? You can use the paid price API." },
  {
    who: "tool",
    name: "check_price",
    args: `{ url: "https://${API}/v1/price?pair=BTC-USD" }`,
    out: "Price: 0.01 tUSD8 for Price of a crypto pair (sample data)\nWould pay: yes, within the mandate's rules.",
  },
  {
    who: "tool",
    name: "pay_and_fetch",
    args: `{ url: "https://${API}/v1/price?pair=BTC-USD", max_price: "0.05" }`,
    out: `Paid 0.01 tUSD8 to 0x24C0…65cC.\nTransaction: ${TX.slice(0, 10)}…${TX.slice(-4)}\n{ "pair": "BTC-USD", "price": 97012.5 }`,
    tone: "paid",
  },
  { who: "claude", text: "BTC is at $97,012.50 (sample data). I paid 0.01 tUSD8 from your mandate; here's the transaction on Aevum." },
  { who: "you", text: "Any news? Read the full story if there is one." },
  {
    who: "tool",
    name: "pay_and_fetch",
    args: `{ url: "https://${API}/rogue/v1/premium?topic=bitcoin" }`,
    out: "Refused, nothing was paid: PayeeNotAllowed: this seller isn't on the mandate's allowed list.",
    tone: "refused",
  },
  {
    who: "claude",
    text: "A headline told me to pay an unknown seller for the \"full story\". Your mandate refused it, so nothing was paid. I'd ignore that link.",
  },
];

export function WithClaude() {
  return (
    <section id="claude" className="section dark-band" aria-labelledby="claude-title">
      <div className="shell claude-grid">
        <div className="claude-copy">
          <p className="eyebrow">Works with Claude</p>
          <h2 id="claude-title">Give your assistant a wallet it can&apos;t empty.</h2>
          <p className="lead">
            AgentMeter ships an MCP server. Claude, or any MCP client, can check a price, pay for one request and verify the receipt,
            with no code. The mandate&apos;s rules still decide every payment, so a prompt-injected assistant is refused on-chain.
          </p>
          <ul className="claude-tools">
            <li>
              <code>check_price</code> what it costs and whether the mandate allows it, for free
            </li>
            <li>
              <code>pay_and_fetch</code> pays for this one request, with an optional max price
            </li>
            <li>
              <code>mandate_budget</code> what&apos;s left today, in total and in escrow
            </li>
            <li>
              <code>verify_receipt</code> proves an answer is the one that was paid for
            </li>
          </ul>
          <pre className="code claude-setup">{`claude mcp add agentmeter \\
  -e AGENT_KEY=0x… -e MANDATE_ID=1 \\
  -e MANDATE_ADDRESS=0x9faB…65e0 \\
  -- npx -y -p @standeva/agentmeter agentmeter-mcp`}</pre>
          <Link className="btn light" href="/docs/mcp">
            Set it up in Claude
          </Link>
        </div>

        <figure className="chat" aria-label="Example: Claude paying through AgentMeter">
          <figcaption className="chat-head">
            <span>Claude · agentmeter tools</span>
            <span>Example session</span>
          </figcaption>
          <ol className="chat-log">
            {TURNS.map((t, i) =>
              t.who === "tool" ? (
                <li key={i} className={`chat-tool ${t.tone ?? ""}`}>
                  <div className="chat-tool-call">
                    <span className="chat-tool-name">{t.name}</span> <span className="chat-tool-args">{t.args}</span>
                  </div>
                  <pre className="chat-tool-out">{t.out}</pre>
                  {t.tone === "paid" && (
                    <a className="chat-tool-link" href={`https://explorer-test.qday.info/tx/${TX}`} target="_blank" rel="noreferrer">
                      See this payment on the explorer ↗
                    </a>
                  )}
                </li>
              ) : (
                <li key={i} className={`chat-msg ${t.who}`}>
                  <span className="chat-who">{t.who === "you" ? "You" : "Claude"}</span>
                  <p>{t.text}</p>
                </li>
              ),
            )}
          </ol>
        </figure>
      </div>
    </section>
  );
}
