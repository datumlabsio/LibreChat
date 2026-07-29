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

const CHART_HEIGHT = 360;

const EChartsBlock: React.FC<EChartsBlockProps> = memo(({ lang, children }) => {
  const { theme } = useContext(ThemeContext);
  const isDarkMode = isDark(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [renderError, setRenderError] = useState(false);

  const option = useMemo(() => parseChartContent(lang, children), [lang, children]);

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
          chartRef.current = echarts.init(el, isDarkMode ? 'dark' : undefined);
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
    <div className="w-full overflow-hidden rounded-lg border border-border-light bg-surface-primary-alt p-2 dark:bg-white/[0.03]">
      <div ref={containerRef} style={{ width: '100%', height: CHART_HEIGHT }} />
    </div>
  );
});

EChartsBlock.displayName = 'EChartsBlock';

export default EChartsBlock;
