import { MUD_MOUND_FACETS, MUD_MOUND_VIEWBOX } from '@/theme/mudMoundGeometry';

interface Props {
  className?: string;
}

// Mud mound mark in currentColor. Facets are shaded by tone so the silhouette keeps its faceting.
const TONE_OPACITY = [0.55, 0.65, 0.75, 0.85, 0.92, 1];

// Name kept from the upstream fork (code identifier); the artwork is the mud mound.
export function WizardMark({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox={MUD_MOUND_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor" stroke="none">
        {MUD_MOUND_FACETS.map((facet, i) => (
          <polygon key={i} points={facet.points} fillOpacity={TONE_OPACITY[facet.tone]} />
        ))}
      </g>
    </svg>
  );
}
