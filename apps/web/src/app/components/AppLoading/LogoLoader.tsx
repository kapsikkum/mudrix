import { useAtomValue } from 'jotai';
import { effectiveThemeAtom, themedAppIconAtom } from '@/app/store/atoms';
import { MUD_MOUND_FACETS, MUD_MOUND_VIEWBOX } from '@/theme/mudMoundGeometry';
import * as css from './LogoLoader.css';

export function LogoLoader() {
  const themedAppIcon = useAtomValue(themedAppIconAtom);
  const theme = useAtomValue(effectiveThemeAtom);
  const logoTheme = themedAppIcon && theme in css.tones[0] ? theme : 'Carbon';
  return (
    <svg
      className={css.svg}
      viewBox={MUD_MOUND_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Mudrix logo"
    >
      <g stroke="none">
        {MUD_MOUND_FACETS.map((facet, i) => (
          <polygon key={i} className={css.tones[facet.tone][logoTheme]} points={facet.points} />
        ))}
      </g>
    </svg>
  );
}
