import { Fragment, type ReactNode } from "react";

/**
 * Tiny, dependency-free inline-markdown renderer.
 * Supports **bold**, *italic*, and `code`. Enough for card summaries without
 * pulling in a full markdown pipeline. Renders plain text safely (no dangerouslySetInnerHTML).
 */
function renderInline(text: string): ReactNode[] {
  // Split on the three inline tokens, keeping the delimiters.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(pattern).filter(Boolean);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-neutral-900 dark:text-neutral-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return <p className={className}>{renderInline(text)}</p>;
}
