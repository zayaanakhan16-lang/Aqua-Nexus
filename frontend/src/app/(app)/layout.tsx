/**
 * Application route-group layout.
 *
 * Every authenticated section (Intelligence Home, Explore Map, Study Areas, the
 * study-area workspace and the Water Atlas) shares this shell: a coherent nav,
 * the study-area store and the toast queue. The public landing page at `/` sits
 * outside this group and keeps its own layout.
 */
import { AppShell } from "@/components/shell/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
