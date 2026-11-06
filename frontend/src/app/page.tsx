import { redirect } from "next/navigation";

/**
 * The root path is not a surface of its own. `/explore` is the single
 * water-intelligence workspace, so `/` redirects straight into it rather than
 * rendering a separate entry point.
 */
export default function RootPage() {
  redirect("/explore");
}
