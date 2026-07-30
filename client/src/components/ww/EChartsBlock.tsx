import React, { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeContext, isDark } from '@librechat/client';
import type { ECharts } from 'echarts';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import { parseChartContent } from './chartToOption';

/**
 * WestWise fork (fork-01): renders ```chart / ```echarts fences as live
 * ECharts. Registered in MarkdownComponents.tsx alongside the mermaid
 * special-case; invalid JSON falls back to the default code block.
 */

// Lazy load echarts library (mirrors the lazy mermaid import in useMermaid)
let echartsPromise: Promise<typeof import('echarts') | null> | null = null;

const loadECharts = () => {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (!echartsPromise) {
    echartsPromise = import('echarts');
  }

  return echartsPromise;
};

interface EChartsBlockProps {
  lang?: string | null;
  children: string;
}

/**
 * fork-01a: defense-in-depth against option-injection XSS (CVE-2026-45249 /
 * GHSA-fgmj-fm8m-jvvx and similar HTML-tooltip sinks). The option object comes
 * from LLM output, so treat it as untrusted:
 * - drop any function-typed values (cannot occur via JSON.parse, but keep the
 *   invariant explicit in case the parse path ever changes);
 * - drop string `formatter` fields containing '<' (HTML template injection);
 * - force `renderMode: 'richText'` on every tooltip so echarts never renders
 *   tooltip content through its innerHTML sink (the CVE-2026-45249 vector).
 */
const sanitizeOption = (value: unknown): unknown => {
  if (typeof value === 'function') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOption(item));
  }
  if (typeof value !== 'object' || value == null) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') {
      continue;
    }
    if (key === 'formatter' && typeof entry === 'string' && entry.includes('<')) {
      continue;
    }
    const sanitized = sanitizeOption(entry);
    if (key === 'tooltip') {
      if (Array.isArray(sanitized)) {
        result[key] = sanitized.map((item) =>
          typeof item === 'object' && item != null
            ? { ...(item as Record<string, unknown>), renderMode: 'richText' }
            : item,
        );
        continue;
      }
      if (typeof sanitized === 'object' && sanitized != null) {
        result[key] = { ...(sanitized as Record<string, unknown>), renderMode: 'richText' };
        continue;
      }
    }
    result[key] = sanitized;
  }
  return result;
};

const CHART_HEIGHT = 360;

const EChartsBlock: React.FC<EChartsBlockProps> = memo(({ lang, children }) => {
  const { theme } = useContext(ThemeContext);
  const isDarkMode = isDark(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [renderError, setRenderError] = useState(false);

  const option = useMemo(() => {
    const parsed = parseChartContent(lang, children);
    return parsed == null ? null : (sanitizeOption(parsed) as Record<string, unknown>);
  }, [lang, children]);

  useEffect(() => {
    setRenderError(false);
  }, [option]);

  useEffect(() => {
    const el = containerRef.current;
    if (!option || !el) {
      return;
    }

    let disposed = false;
    let observer: ResizeObserver | null = null;

    loadECharts()
      .then((echarts) => {
        if (disposed || !echarts) {
          return;
        }
        try {
          // fork-01a: canvas renderer — never SVG — so option content cannot
          // become DOM/SVG markup.
          chartRef.current = echarts.init(el, isDarkMode ? 'dark' : undefined, {
            renderer: 'canvas',
          });
          chartRef.current.setOption({ backgroundColor: 'transparent', ...option });
          observer = new ResizeObserver(() => chartRef.current?.resize());
          observer.observe(el);
        } catch (error) {
          console.error('ECharts rendering error:', error);
          setRenderError(true);
        }
      })
      .catch((error) => {
        console.error('Failed to load echarts library:', error);
        setRenderError(true);
      });

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [option, isDarkMode]);

  if (!option || renderError) {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }

  return (
    <div
      // Build-integrity marker (ADR-25): asserted by ww-ci in the bundled client.
      data-ww="ww-echarts-block"
      className="w-full overflow-hidden rounded-lg border border-border-light bg-surface-primary-alt p-2 dark:bg-white/[0.03]"
    >
      <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT }} />
    </div>
  );
});

EChartsBlock.displayName = 'EChartsBlock';

export default EChartsBlock;
