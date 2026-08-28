export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
        <path
          d="M10 21V11.5C10 10.7 10.7 10 11.5 10H17C19.5 10 21.5 12 21.5 14.5C21.5 17 19.5 19 17 19H13.5V21"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span className="text-xl font-semibold tracking-tight text-(--color-text)">Pana</span>
    </span>
  );
}
