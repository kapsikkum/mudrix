import { memo, useMemo, type ReactElement } from 'react';
import { vars } from '@/theme/vars.css';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  barGap?: number;
  barRadius?: number;
  progress?: number;
  color?: string;
  progressColor?: string;
}

export const Waveform = memo(function Waveform({
  data,
  width = 280,
  height = 44,
  barGap = 2,
  barRadius = 2,
  progress = 1,
  color = `rgba(${vars.color.accentRgb}, 0.2)`,
  progressColor = vars.color.accent,
}: Props) {
  const bars = useMemo(() => {
    const count = data.length;
    const barW = (width - (count - 1) * barGap) / count;
    const mid = height / 2;
    const elements: ReactElement[] = [];

    for (let i = 0; i < count; i++) {
      const amp = Math.max(Math.pow(data[i], 0.5) * (height - 4), 2);
      const x = i * (barW + barGap);
      const y = mid - amp / 2;

      const isPlayed = i / count <= progress;

      elements.push(
        <rect
          key={i}
          x={x}
          y={y}
          width={barW}
          height={amp}
          rx={barRadius}
          fill={isPlayed ? progressColor : color}
        />
      );
    }

    return elements;
  }, [data, width, height, barGap, barRadius, progress, color, progressColor]);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      preserveAspectRatio="none"
    >
      {bars}
    </svg>
  );
});
