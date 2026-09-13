"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="icon-button" type="button" title="Sign out" aria-label="Sign out" onClick={async () => { await authClient.signOut(); router.push("/login"); router.refresh(); }}>
      <LogOut aria-hidden="true" />
    </button>
  );
}
