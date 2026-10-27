/** شعار «تشكيلة»: درع منقسم بلوني الفريقين، تتوسطه عارضة ميزان ونقطة ارتكاز ذهبية */
export function LogoMark({ a = '#D7263D', b = '#1B7FE0', size = 36 }: { a?: string; b?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id="mz-shield">
          <path d="M32 4 54 13.5 52 40C48 51 41 57 32 60 23 57 16 51 12 40L10 13.5Z" />
        </clipPath>
        <linearGradient id="mz-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath="url(#mz-shield)">
        <rect x="32" y="0" width="32" height="64" fill={a} />
        <rect x="0" y="0" width="32" height="64" fill={b} />
        <rect width="64" height="64" fill="url(#mz-shine)" />
      </g>
      <path
        d="M32 4 54 13.5 52 40C48 51 41 57 32 60 23 57 16 51 12 40L10 13.5Z"
        fill="none"
        stroke="#F2B84B"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path d="M17 26h30" stroke="#F2B84B" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 26 38.5 44h-13Z" fill="#F2B84B" />
      <circle cx="32" cy="26" r="3.2" fill="#0B1210" stroke="#F2B84B" strokeWidth="2" />
    </svg>
  );
}
