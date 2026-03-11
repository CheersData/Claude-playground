import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import MattiaClient from "./MattiaClient";

export const metadata: Metadata = {
  title: "Svuotalo — Tu svuoti l'armadio. Noi lo vendiamo.",
  description:
    "Marketplace broker per vendere su Vinted senza sbatta. 75% a te, 25% al broker. Powered by Zustand.",
};

export default function MattiaPage() {
  return <MattiaClient />;
}
