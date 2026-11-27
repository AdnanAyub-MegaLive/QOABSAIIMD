import PortalPageSkeleton from "./components/portal-page-skeleton";

// Every portal page renders this immediately on navigation, then streams in its data.
export default function Loading() {
  return <PortalPageSkeleton />;
}
