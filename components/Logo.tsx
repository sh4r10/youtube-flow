export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] bg-accent" style={{ width: size, height: size }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 16 16" fill="none" stroke="#101114" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <path d="M3 4h10M3 8h10M3 12h6" />
      </svg>
    </span>
  );
}
