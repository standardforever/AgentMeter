"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav, docsPages } from "./nav";

export function DocsNav() {
  const pathname = usePathname();
  const current = docsPages.find((p) => p.href === pathname);
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <details className="docs-nav-mobile">
        <summary>{current?.title ?? "Contents"}</summary>
        <List pathname={pathname} />
      </details>
      <div className="docs-nav-desktop">
        <List pathname={pathname} />
      </div>
    </nav>
  );
}

function List({ pathname }: { pathname: string }) {
  return (
    <>
      {docsNav.map((g) => (
        <div key={g.group} className="docs-nav-group">
          <p className="docs-nav-title">{g.group}</p>
          <ul>
            {g.pages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} aria-current={pathname === p.href ? "page" : undefined}>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Previous / next links at the bottom of every page. */
export function DocsPager() {
  const pathname = usePathname();
  const i = docsPages.findIndex((p) => p.href === pathname);
  const prev = i > 0 ? docsPages[i - 1] : undefined;
  const next = i >= 0 && i < docsPages.length - 1 ? docsPages[i + 1] : undefined;
  return (
    <nav className="docs-pager" aria-label="Previous and next page">
      {prev ? (
        <Link href={prev.href}>
          <span className="small quiet">Previous</span>
          {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="next">
          <span className="small quiet">Next</span>
          {next.title}
        </Link>
      )}
    </nav>
  );
}
