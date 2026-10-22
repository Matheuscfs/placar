import type { SVGProps } from "react";

/** Ícones de traço simples, herdam a cor do texto. Sempre decorativos: o significado vem do texto ao lado ou do aria-label do botão. */
const base = (p: SVGProps<SVGSVGElement>) => ({ width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...p });

export const StarIcon = (p: SVGProps<SVGSVGElement> & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.6z" />
    </svg>
  );
};

export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </svg>
);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </svg>
);

export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4" />
  </svg>
);

export const ArrowUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 14, height: 14, strokeWidth: 2.2, ...p })}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 14, height: 14, strokeWidth: 2.2, ...p })}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const BallIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 14, height: 14, ...p })}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2L12 8.2z" />
  </svg>
);

export const WifiOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 3l18 18M8.5 16.2a5 5 0 017 0M5.2 12.9a9.5 9.5 0 013.6-2.1M12 20h.01M10 6.2A14 14 0 0121 10M2.5 9.7a14 14 0 013-2.2" />
  </svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const TvIcon =(p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="11.5" rx="2.5" />
    <path d="M8.5 20h7M12 16.5V20" />
  </svg>
);

export const TableIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const GamepadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="9" rx="4.5" />
    <path d="M8 12.5h3M9.5 11v3M15.5 11.6h.01M17.5 13.4h.01" />
  </svg>
);

export const SunIcon =(p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </svg>
);

export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z" />
  </svg>
);

export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 15V4.5M8 8l4-4 4 4" />
    <path d="M6 11.5v6A2.5 2.5 0 008.5 20h7a2.5 2.5 0 002.5-2.5v-6" />
  </svg>
);
