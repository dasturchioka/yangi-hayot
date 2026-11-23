/** Line icons for the content screens: 24px grid, 1.8 stroke, currentColor. */
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const PhoneIcon = () => (
  <svg {...base}>
    <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" />
  </svg>
);

export const PinIcon = () => (
  <svg {...base}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const SendIcon = () => (
  <svg {...base}>
    <path d="M20.5 4 3.5 11l6 2.2M20.5 4l-4 16-7-6.8M20.5 4 9.5 13.2" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const DocIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20Z" />
    <path d="M14 3.5V8h4M10 12.5h5M10 16h5" />
  </svg>
);

export const ArrowIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
