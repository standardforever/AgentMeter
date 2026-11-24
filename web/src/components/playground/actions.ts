/** What the visitor can make the agent do. Each is a real paid request to the example APIs. */
export type PlayAction = {
  key: string;
  title: string;
  note: string;
  /** Shown with the result: why the contract decided what it did. */
  lesson: { paid: string; refused: string };
  /** The refusal this action is meant to show. Any other refusal gets a plain reason instead of the lesson. */
  expects?: string;
  requests: { url: string; init?: RequestInit }[];
};

export function playActions(sellerUrl: string, rogueUrl: string): PlayAction[] {
  const price = { url: `${sellerUrl}/v1/price?pair=BTC-USD` };
  return [
    {
      key: "price",
      title: "Buy a price",
      note: "0.01 tUSD8 from an allowed seller",
      lesson: {
        paid: "Allowed seller, under every limit: the contract paid it.",
        refused: "A normal request was refused. Check the budget panel for what ran out.",
      },
      requests: [price],
    },
    {
      key: "news",
      title: "Buy the news",
      note: "0.02 tUSD8 from an allowed seller",
      lesson: {
        paid: "Allowed seller, under every limit: the contract paid it.",
        refused: "A normal request was refused. Check the budget panel for what ran out.",
      },
      requests: [{ url: `${sellerUrl}/v1/news?topic=bitcoin` }],
    },
    {
      key: "summary",
      title: "Buy a summary",
      note: "0.03 tUSD8 from an allowed seller",
      lesson: {
        paid: "Allowed seller, under every limit: the contract paid it.",
        refused: "A normal request was refused. Check the budget panel for what ran out.",
      },
      requests: [
        {
          url: `${sellerUrl}/v1/summarize`,
          init: {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: "Bitcoin rose 2% today as trading volume picked up. Analysts pointed to steady inflows. Ether was flat, and smaller coins were mixed.",
            }),
          },
        },
      ],
    },
    {
      key: "scam",
      title: "Fall for a scam",
      note: "0.05 tUSD8 to a seller nobody allowed",
      lesson: {
        paid: "The scam seller is on this budget's allowed list, so it was paid. Remove it to block it again.",
        refused: "The agent was fooled and signed, but the contract only pays sellers on the allowed list. Nothing was paid.",
      },
      expects: "PayeeNotAllowed",
      requests: [{ url: `${rogueUrl}/v1/premium?topic=bitcoin` }],
    },
    {
      key: "report",
      title: "Buy an expensive report",
      note: "0.50 tUSD8, above the per-call cap",
      lesson: {
        paid: "The per-call cap is high enough for this report, so it was paid.",
        refused: "The per-call cap stops any single payment above it, whatever the seller asks.",
      },
      expects: "ExceedsSinglePayment",
      requests: [{ url: `${sellerUrl}/v1/report?topic=crypto` }],
    },
    {
      key: "spam",
      title: "Make 5 quick calls",
      note: "5 × 0.01 tUSD8: watch the budget",
      lesson: {
        paid: "Each call is checked on its own. Watch today's budget go down.",
        refused: "The budget ran out, so the contract started refusing. A runaway agent stops here.",
      },
      expects: "ExceedsPeriodBudget",
      requests: [price, price, price, price, price],
    },
  ];
}
