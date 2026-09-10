// ============================================================================
// ラインアイコン。
// アイコンフォントやライブラリを足さずに済むよう、必要な分だけ自前で持つ。
// currentColor を使うので色は CSS 側で決める。
// ============================================================================

interface Props {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

function Svg({
  size = 20,
  strokeWidth = 1.8,
  className,
  style,
  children,
}: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: Props) => (
  <Svg {...p}>
    <path d="M3 10.2 12 3l9 7.2" />
    <path d="M5.5 9.4V20h13V9.4" />
  </Svg>
);

export const IconReceipt = (p: Props) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
  </Svg>
);

export const IconChart = (p: Props) => (
  <Svg {...p}>
    <path d="M6 20v-6M12 20V5M18 20v-9" />
  </Svg>
);

export const IconDots = (p: Props) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Svg>
);

export const IconPlus = (p: Props) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconClose = (p: Props) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconChevronLeft = (p: Props) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const IconChevronRight = (p: Props) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const IconCalendar = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const IconCard = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M2.5 10h19" />
  </Svg>
);

export const IconTag = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 11.4V5a1.5 1.5 0 0 1 1.5-1.5h6.4a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6 6a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.5-1.5Z" />
    <path d="M7.8 7.8h.01" />
  </Svg>
);

export const IconNote = (p: Props) => (
  <Svg {...p}>
    <path d="M12.5 4.5H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" />
    <path d="M17.5 3.2a1.9 1.9 0 0 1 2.7 2.7l-8 8-3.3.6.6-3.3Z" />
  </Svg>
);

export const IconTarget = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </Svg>
);

export const IconRepeat = (p: Props) => (
  <Svg {...p}>
    <path d="M4 9V7.5A2.5 2.5 0 0 1 6.5 5H18l-2.5-2.5M20 15v1.5a2.5 2.5 0 0 1-2.5 2.5H6l2.5 2.5" />
  </Svg>
);

export const IconHistory = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
);

export const IconDownload = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5v11M8 11l4 4 4-4" />
    <path d="M4.5 19.5h15" />
  </Svg>
);

export const IconUpload = (p: Props) => (
  <Svg {...p}>
    <path d="M12 15.5v-11M8 8l4-4 4 4" />
    <path d="M4.5 19.5h15" />
  </Svg>
);

export const IconTrash = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
  </Svg>
);

export const IconEdit = (p: Props) => (
  <Svg {...p}>
    <path d="M16.8 3.4a2 2 0 0 1 2.8 2.8L8.4 17.4l-3.7.9.9-3.7Z" />
  </Svg>
);

export const IconArrowUp = (p: Props) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconArrowDown = (p: Props) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const IconCheck = (p: Props) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const IconInfo = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const IconUser = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconCamera = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 8.5a2 2 0 0 1 2-2h1.8l1.2-2h6.9l1.2 2h1.9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    <circle cx="12" cy="13" r="3.6" />
  </Svg>
);

export const IconWallet = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2Z" />
    <path d="M16 12h3.5" />
  </Svg>
);

export const IconLock = (p: Props) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Svg>
);

export const IconLogout = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8" />
    <path d="M14 12h7M18 8.5l3.5 3.5L18 15.5" />
  </Svg>
);
