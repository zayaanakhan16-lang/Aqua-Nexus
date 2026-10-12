import type { Metadata } from "next";

import ExploreClient from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore Map — AquaNexus",
  description:
    "Search the world, select a location, and save it as a study area to investigate its water conditions.",
};

export default function ExplorePage() {
  return <ExploreClient />;
}
