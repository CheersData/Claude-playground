// Server component wrapper — force-dynamic for token-based auth (sessionStorage on mount)
export const dynamic = "force-dynamic";

import Ops2PageClient from "./Ops2PageClient";

export default function Ops2Page() {
  return <Ops2PageClient />;
}
