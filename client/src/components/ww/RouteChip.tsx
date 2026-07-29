import React, { memo } from 'react';
import { cn } from '~/utils';

/**
 * WestWise fork (fork-02): route chip for the ⚡ deep-reasoning marker.
 *
 * The WestWise agent may prefix a <think> block's first line with a route
 * marker like: `⚡ deep reasoning (gemini-3.1-pro-preview) — comparative question`.
 * `splitRouteMarker` peels that line off the reasoning body so it can be
 * rendered as a chip above the Thoughts content (see ThinkingContent in
 * Thinking.tsx).
 */

export const ROUTE_MARKER_PREFIX = '⚡';

export function splitRouteMarker(text: string): { route: string | null; body: string } {
  if (!text.startsWith(ROUTE_MARKER_PREFIX)) {
    return { route: null, body: text };
  }
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1) {
    return { route: text.trim(), body: '' };
  }
  return {
    route: text.slice(0, newlineIndex).trim(),
    body: text.slice(newlineIndex + 1).replace(/^\s+/, ''),
  };
}

const RouteChip: React.FC<{ label: string; className?: string }> = memo(
  ({ label, className }) => (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border border-border-light bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary',
        className,
      )}
    >
      {label}
    </span>
  ),
);

RouteChip.displayName = 'RouteChip';

export default RouteChip;
