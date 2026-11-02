interface Props {
  className?: string;
}

export function WizardMark({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0, 40)" fill="currentColor" stroke="none">
        <polygon points="0,280 100,320 200,270 100,230" />
        <polygon points="100,320 300,320 200,270" />
        <polygon points="400,280 300,320 200,270 300,230" />
        <polygon points="100,230 200,270 230,80 200,70" />
        <polygon points="200,270 300,230 260,75 230,80" />
        <polygon points="200,70 230,80 260,75 300,0" />
      </g>
    </svg>
  );
}
