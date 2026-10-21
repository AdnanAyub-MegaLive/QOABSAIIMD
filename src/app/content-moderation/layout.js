import Link from "next/link";
export default function ContentLayout({ children }) {
  return <><nav aria-label="Safety sections" className="flex gap-4 bg-white p-4 lg:pl-72"><Link href="/content-moderation">Content review</Link><Link href="/content-moderation/reports">User &amp; room reports</Link></nav>{children}</>;
}
