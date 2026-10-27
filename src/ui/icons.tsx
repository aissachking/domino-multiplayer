// أيقونات خطية بسيطة مرسومة يدويًا
type P = { size?: number };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconShuffle = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6C14.3 16 15.5 17 17.5 17H21" />
    <path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4C15 7.5 16 7 17.5 7H21" />
    <path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" />
  </svg>
);
export const IconBalance = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 4v16M7 20h10M5 7h14" />
    <path d="m5 7-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3L5 7ZM19 7l-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3l-3-6Z" />
  </svg>
);
export const IconReset = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" />
    <path d="M4 4v4.6h4.6" />
  </svg>
);
export const IconImage = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-5-5-9 9" />
  </svg>
);
export const IconSave = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 3h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M8 3v5h7V3M8 21v-6h8v6" />
  </svg>
);
export const IconPin = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8" />
  </svg>
);
export const IconSwap = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" />
  </svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);
export const IconEdit = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
  </svg>
);
export const IconClose = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14" />
  </svg>
);
export const IconFolder = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);
export const IconBench = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 10h18M5 10v8M19 10v8M3 14h18" />
  </svg>
);
