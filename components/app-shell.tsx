import Link from "next/link";
import { Bell, Building2, ClipboardList, LayoutDashboard, Settings, ShieldCheck, Users, Wrench } from "lucide-react";
import type { Viewer } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";

const navigation = {
  MANAGER: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/tickets", label: "Work orders", icon: ClipboardList },
    { href: "/properties", label: "Properties", icon: Building2 },
    { href: "/members", label: "People", icon: Users },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  TENANT: [
    { href: "/dashboard", label: "My repairs", icon: LayoutDashboard },
    { href: "/submit", label: "New request", icon: Wrench },
    { href: "/notifications", label: "Notifications", icon: Bell },
  ],
  CONTRACTOR: [
    { href: "/dashboard", label: "Assigned work", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/notifications", label: "Notifications", icon: Bell },
  ],
};

export function AppShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const nav = navigation[viewer.role];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="RepairFlow home">
          <span className="brand-mark"><Wrench aria-hidden="true" /></span>
          <span><strong>RepairFlow</strong><small>Maintenance operations</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          {nav.map((item) => <Link href={item.href} key={item.href}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck aria-hidden="true" />
          <span><strong>{viewer.name}</strong><small>{viewer.role.toLowerCase()}</small></span>
          <LogoutButton />
        </div>
      </aside>
      <div className="main-column">
        <header className="mobile-header">
          <Link className="brand compact" href="/dashboard"><span className="brand-mark"><Wrench aria-hidden="true" /></span><strong>RepairFlow</strong></Link>
          <LogoutButton />
        </header>
        <main className="page-content">{children}</main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.slice(0, 4).map((item) => <Link href={item.href} key={item.href}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}
        </nav>
      </div>
    </div>
  );
}
