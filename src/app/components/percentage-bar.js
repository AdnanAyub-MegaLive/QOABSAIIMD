// Numeric chart geometry is SVG data; all presentation stays in Tailwind classes.
export default function PercentageBar({ value, vertical = false, className = "", label }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <rect x="0" y={vertical ? 100 - percent : 0} width={vertical ? 100 : percent}
      height={vertical ? percent : 100} className="fill-current" />
  </svg>;
}
