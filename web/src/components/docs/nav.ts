/** The docs sidebar, in reading order. One list so the sidebar and the previous/next links agree. */
export const docsNav: { group: string; pages: { href: string; title: string }[] }[] = [
  {
    group: "Get started",
    pages: [
      { href: "/docs", title: "Overview" },
      { href: "/docs/agents", title: "Quickstart for agents" },
      { href: "/docs/sellers", title: "Quickstart for sellers" },
      { href: "/docs/owners", title: "Quickstart for owners" },
      { href: "/docs/quickstart", title: "Run the example stack" },
    ],
  },
  {
    group: "Concepts",
    pages: [{ href: "/docs/concepts", title: "How AgentMeter works" }],
  },
  {
    group: "Guides",
    pages: [
      { href: "/docs/guides/refusals", title: "Handle refused payments" },
      { href: "/docs/guides/receipts", title: "Record and verify receipts" },
      { href: "/docs/guides/keys", title: "Rotate or revoke an agent key" },
      { href: "/docs/guides/facilitator", title: "Run a facilitator" },
      { href: "/docs/deploy", title: "Deploy AgentMandate" },
    ],
  },
  {
    group: "Reference",
    pages: [
      { href: "/docs/reference/client", title: "SDK: client" },
      { href: "/docs/reference/server", title: "SDK: server" },
      { href: "/docs/reference/utilities", title: "SDK: utilities" },
      { href: "/docs/facilitator", title: "Facilitator HTTP API" },
      { href: "/docs/contract", title: "AgentMandate contract" },
      { href: "/docs/protocol", title: "Payment scheme" },
      { href: "/docs/errors", title: "Errors" },
      { href: "/docs/reference/networks", title: "Networks" },
    ],
  },
];

export const docsPages = docsNav.flatMap((g) => g.pages);
