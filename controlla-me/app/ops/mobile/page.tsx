// Server component wrapper — export const dynamic only works in server components
// Mobile-optimized ops view for boss on-the-go

export const dynamic = "force-dynamic";

import MobileOpsView from "@/components/ops/MobileOpsView";

export default function MobileOpsPage() {
  return <MobileOpsView />;
}
