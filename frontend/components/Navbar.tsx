"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldHalf } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <nav className="navbar">
      <div className="navbar__left">
        <div className="navbar__brand">
          <ShieldHalf size={20} />
          ThermoGuard
        </div>
        <div className="navbar__links">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="navbar__link" data-active={pathname === link.href}>
              {link.label}
              {link.href === "/alerts" && alertCount > 0 && (
                <span className="navbar__badge">{alertCount}</span>
              )}
            </Link>
          ))}
        </div>
      </div>
      <div className="navbar__right">
        <div className="navbar__user" onClick={logout} title="Click to log out">
          <div className="navbar__avatar">{initials}</div>
          <span>{user?.name || "..."}</span>
        </div>
      </div>
    </nav>
  );
}
