type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const CrossIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const WarnIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);
export const StopIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6 6l12 12" />
  </svg>
);
export const ClockIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const DotIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="5" fill="currentColor" />
  </svg>
);
export const ExternalIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const GitHubIcon = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/** The AgentMeter mark: a meter dial whose needle stops at the limit line. */
export const MeterMark = ({ className }: P) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <path d="M4 22a12 12 0 0 1 24 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M24.6 12.2l-2.3 1.9" stroke="#b83a2c" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M16 22l6.2-7.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="22" r="2.6" fill="currentColor" />
  </svg>
);
