import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { HttpRequest } from '@/lib/http-client/core';
import { effectiveUrl, matchExcerpt } from './lib';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Marks every case-insensitive occurrence of `highlight` in `text` in yellow. */
export function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  const term = highlight.trim();
  if (!term || !text) return <>{text}</>;
  // One capture group makes split() return every match at an odd index.
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-[2px] bg-yellow-200 px-px text-black dark:bg-yellow-400"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A request row label for the sidebar. While searching, a request that matched by URL shows that
 * URL (trimmed around the match) under its name so the match is not a mystery.
 */
export function RequestLabel({
  request,
  filter,
  className,
}: {
  request: HttpRequest;
  filter: string;
  className?: string;
}) {
  const term = filter.trim();
  const url = effectiveUrl(request);
  const urlMatches = term !== '' && url.toLowerCase().includes(term.toLowerCase());
  return (
    <span className={cn('flex flex-col', className)}>
      <span>
        <HighlightText text={request.name} highlight={term} />
      </span>
      {urlMatches && (
        <span className="font-mono text-[10px] opacity-60">
          <HighlightText text={matchExcerpt(url, term)} highlight={term} />
        </span>
      )}
    </span>
  );
}
