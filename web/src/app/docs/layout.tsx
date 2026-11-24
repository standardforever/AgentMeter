import type { ReactNode } from "react";
import { DocsNav, DocsPager } from "@/components/docs/DocsNav";
import "./docs.css";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell docs">
      <DocsNav />
      <article className="docs-article">
        {children}
        <DocsPager />
      </article>
    </div>
  );
}
