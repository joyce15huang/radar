"use client";

import type { MouseEvent } from "react";
import { splitLinks } from "@/lib/links";

/**
 * Plain text with its links made tappable and shortened ("instagram.com/p/C9…").
 * `nested`: the text sits inside another link or button (a calendar row), so
 * links open from a span and don't trigger the row.
 */
export function LinkText({ text, className, nested = false }: { text: string; className?: string; nested?: boolean }) {
  const parts = splitLinks(text);
  const cls = "font-semibold text-fuchsia-800 underline decoration-fuchsia-300 underline-offset-2 break-all";
  const open = (href: string) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : nested ? (
          <span
            key={i}
            role="link"
            tabIndex={0}
            title={p.href}
            onClick={open(p.href)}
            onKeyDown={(e) => {
              if (e.key === "Enter") open(p.href)(e as unknown as MouseEvent);
            }}
            className={`${cls} cursor-pointer`}
          >
            {p.label}
          </span>
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" title={p.href} className={cls}>
            {p.label}
          </a>
        ),
      )}
    </p>
  );
}
