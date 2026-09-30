import { niceStep, type Metric, type Timeline } from '../../game/timeline.ts';

/**
 * A line graph of one timeline metric (M12.4): one line per player in their colour (a dark underline keeps it
 * readable on the stone panel), minutes along the bottom, a few round values up the side, and each player's age
 * advances marked on their line (II Tool, III Bronze, IV Iron).
 */
const W = 680;
const H = 250;
const L = 48;
const R = 24;
const T = 12;
const B = 28;
const AGE_MARK = ['II', 'III', 'IV'];

export function Graph({ data, metric, colors }: { data: Timeline; metric: Metric; colors: Record<number, string> }) {
  const rows = data.series[metric];
  const ticks = data.ticks;
  const maxTick = Math.max(1, ticks[ticks.length - 1] ?? 1);
  const maxVal = Math.max(1, ...rows.flat());
  const minVal = Math.min(0, ...rows.flat()); // an eliminated player's score goes below zero (−100)
  const yStep = niceStep(maxVal - minVal);
  const yTop = Math.ceil(maxVal / yStep) * yStep;
  const yBot = Math.floor(minVal / yStep) * yStep;
  const x = (tick: number) => L + (tick / maxTick) * (W - L - R);
  const y = (v: number) => T + ((yTop - v) / (yTop - yBot)) * (H - T - B);
  const minutes = maxTick / 1200;
  const mStep = [1, 2, 5, 10, 15, 20, 30, 60].find((s) => minutes / s <= 8) ?? 60;
  const valueAt = (col: number, tick: number): number => {
    let i = 0;
    while (i + 1 < ticks.length && ticks[i + 1]! <= tick) i++;
    const t0 = ticks[i]!;
    const t1 = ticks[i + 1] ?? t0;
    const a = rows[i]?.[col] ?? 0;
    const b = rows[i + 1]?.[col] ?? a;
    return t1 > t0 ? a + ((b - a) * (tick - t0)) / (t1 - t0) : a;
  };
  return (
    <svg class="graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} data-testid="graph" data-metric={metric}>
      {Array.from({ length: Math.round((yTop - yBot) / yStep) + 1 }, (_, k) => {
        const v = yBot + k * yStep;
        return (
          <g>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class={v === 0 ? 'grid zero' : 'grid'} />
            <text x={L - 6} y={y(v) + 4} class="axis" text-anchor="end">
              {v >= 10000 ? `${Math.round(v / 1000)}k` : Math.round(v * 10) / 10}
            </text>
          </g>
        );
      })}
      {Array.from({ length: Math.floor(minutes / mStep) + 1 }, (_, k) => (
        <text x={x(k * mStep * 1200)} y={H - 8} class="axis" text-anchor="middle">
          {k * mStep}:00
        </text>
      ))}
      {data.players.map((id, col) => {
        const pts = ticks.map((t, i) => `${x(t).toFixed(1)},${y(rows[i]?.[col] ?? 0).toFixed(1)}`).join(' ');
        return (
          <g data-testid={`graph-line-${id}`}>
            <polyline points={pts} class="shadow" />
            <polyline points={pts} class="line" style={{ stroke: colors[id] }} data-points={ticks.length} />
            {(data.ages[col] ?? []).map((t, a) =>
              t > 0 && t <= maxTick ? (
                <g class="age-mark">
                  <circle cx={x(t)} cy={y(valueAt(col, t))} r="4.5" style={{ fill: colors[id] }} />
                  <text x={x(t)} y={y(valueAt(col, t)) - 8} text-anchor="middle">
                    {AGE_MARK[a]}
                  </text>
                </g>
              ) : null,
            )}
          </g>
        );
      })}
    </svg>
  );
}
