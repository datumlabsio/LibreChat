/**
 * WestWise fork (fork-01): conversion helpers for ```chart / ```echarts fences.
 *
 * ```echarts fences carry a raw ECharts `option` object as JSON and are used
 * as-is; ```chart fences carry a simple schema that is converted to an ECharts
 * option here. Any parse/shape failure returns `null` so the caller can fall
 * back to the default code block rendering.
 */

export type SimpleChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter';

export interface SimpleChartSeries {
  name?: string;
  data: unknown[];
}

export interface SimpleChartSpec {
  type: SimpleChartType;
  title?: string;
  x?: unknown[];
  series?: SimpleChartSeries[];
  data?: unknown[];
}

const AXIS_TYPES = new Set<string>(['bar', 'line', 'area']);
const SIMPLE_TYPES = new Set<string>(['bar', 'line', 'area', 'pie', 'scatter']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value != null && !Array.isArray(value);

/** Convert the simple ```chart schema to an ECharts option; `null` when the shape is invalid. */
export function simpleChartToOption(spec: SimpleChartSpec): Record<string, unknown> | null {
  if (typeof spec.type !== 'string' || !SIMPLE_TYPES.has(spec.type)) {
    return null;
  }

  const option: Record<string, unknown> = {};
  if (typeof spec.title === 'string' && spec.title) {
    option.title = { text: spec.title, left: 'center' };
  }

  if (AXIS_TYPES.has(spec.type)) {
    if (!Array.isArray(spec.x) || !Array.isArray(spec.series)) {
      return null;
    }
    const series = spec.series.map((s) => ({
      name: s?.name,
      type: spec.type === 'area' ? 'line' : spec.type,
      ...(spec.type === 'area' ? { areaStyle: {} } : {}),
      data: Array.isArray(s?.data) ? s.data : [],
    }));
    return {
      ...option,
      tooltip: { trigger: 'axis' },
      ...(series.length > 1 ? { legend: { bottom: 0 } } : {}),
      grid: { left: 48, right: 24, top: option.title ? 48 : 24, bottom: series.length > 1 ? 48 : 32 },
      xAxis: { type: 'category', data: spec.x },
      yAxis: { type: 'value' },
      series,
    };
  }

  if (!Array.isArray(spec.data)) {
    return null;
  }

  if (spec.type === 'pie') {
    return {
      ...option,
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: '60%', data: spec.data }],
    };
  }

  // scatter: data is [[x, y], ...]
  return {
    ...option,
    tooltip: { trigger: 'item' },
    grid: { left: 48, right: 24, top: option.title ? 48 : 24, bottom: 32 },
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: spec.data }],
  };
}

/**
 * Parse a ```chart / ```echarts fence body into an ECharts option.
 * Returns `null` for invalid JSON or shapes (caller falls back to a code block).
 */
export function parseChartContent(
  lang: string | null | undefined,
  content: string,
): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  if (lang === 'echarts') {
    return parsed;
  }
  return simpleChartToOption(parsed as unknown as SimpleChartSpec);
}
