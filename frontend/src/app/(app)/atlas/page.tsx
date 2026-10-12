import type { Metadata } from "next";

import AtlasClient from "./AtlasClient";

export const metadata: Metadata = {
  title: "Water Atlas — AquaNexus",
  description:
    "Explore global water conditions: rainfall history, anomalies, forecasts, modelled discharge and satellite scene coverage.",
};

export default function AtlasPage() {
  return <AtlasClient />;
}
