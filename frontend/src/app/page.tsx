import { redirect } from "next/navigation";

/**
 * The root path is not a surface of its own. `/home` is the returning-user
 * entry point and `/explore` the single water-intelligence workspace, so `/`
 * redirects straight into the app rather than rendering a second front door.
 */
export default function RootPage() {
  redirect("/home");
}
