import Image from "next/image";

export default function BrandLogo({
  light=false,
  compact=false,
  priority=false,
  className="",
}) {
  const size=compact?40:48;
  return <span className={`flex items-center gap-3 ${light?"text-white":"text-[#142c2a]"} ${className}`}>
    <Image
      src="/stream-line-logo.png"
      alt="Mega Live Portal"
      width={size}
      height={size}
      priority={priority}
      className={`${compact?"h-10 w-10 rounded-xl":"h-12 w-12 rounded-[14px]"} shrink-0 object-cover shadow-[0_8px_24px_rgba(0,0,0,.16)]`}
    />
    <span className={`${compact?"text-xl":"text-[22px]"} font-bold tracking-[-.6px]`}>Mega Live</span>
  </span>;
}
