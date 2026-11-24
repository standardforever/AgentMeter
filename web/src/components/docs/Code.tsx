"use client";

import { useState } from "react";

/** A code block with a copy button. `title` names the file or the shell it belongs to. */
export function Code({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const text = children.replace(/^\n/, "").replace(/\n\s*$/, "");
  return (
    <div className="docs-code">
      <div className="docs-code-bar">
        <span>{title ?? ""}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard blocked: the code is on screen to copy by hand.
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** A short aside: "note" for context, "warn" for something that can cost money or break a setup. */
export function Callout({ tone = "note", children }: { tone?: "note" | "warn"; children: React.ReactNode }) {
  return (
    <div className={`docs-callout ${tone}`}>
      <strong className="docs-callout-label">{tone === "warn" ? "Warning" : "Note"}</strong>
      <div>{children}</div>
    </div>
  );
}
