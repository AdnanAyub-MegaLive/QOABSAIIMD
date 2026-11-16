"use client";
import { usePathname } from "next/navigation";
import { SidebarView } from "../../components/portal-sidebar";
import EventsLogoutButton from "./events-logout-button";
export default function EventsNavigation({ links, user }) {
  const pathname = usePathname();
  return <SidebarView pathname={pathname} navigation={links} workspace="Events Studio" footer={<><p className="truncate font-semibold text-white">{user.name}</p><p className="mb-3 text-xs">{user.role.replaceAll("_", " ")}</p><EventsLogoutButton /></>}/>;
}
