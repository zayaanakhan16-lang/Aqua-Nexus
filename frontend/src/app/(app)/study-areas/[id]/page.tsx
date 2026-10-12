import type { Metadata } from "next";

import { StudyAreaWorkspace } from "./StudyAreaWorkspace";

export const metadata: Metadata = {
  title: "Study Area — AquaNexus",
  description:
    "Location intelligence workspace: weather, precipitation, water-stress signals, modelled discharge and satellite coverage for a saved study area.",
};

export default function StudyAreaPage({ params }: { params: { id: string } }) {
  return <StudyAreaWorkspace areaId={params.id} />;
}
