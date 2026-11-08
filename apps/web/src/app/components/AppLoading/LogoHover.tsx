import { MUD_MOUND_FACETS, MUD_MOUND_VIEWBOX } from '@/theme/mudMoundGeometry';
import * as css from './LogoHover.css';

interface Props {
  size?: number;
}

export function LogoHover({ size = 72 }: Props) {
  return (
    <svg
      className={css.svg}
      viewBox={MUD_MOUND_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Mudrix Logo"
      width={size}
      height={size}
    >
      <g stroke="none">
        {MUD_MOUND_FACETS.map((facet, i) => (
          <polygon key={i} className={css.tones[facet.tone]} points={facet.points} />
        ))}
      </g>
    </svg>
  );
}
