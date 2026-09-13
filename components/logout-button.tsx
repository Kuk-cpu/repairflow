import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/session";

export function LogoutButton() {
  return (
    <form action={signOutAction} className="logout-form">
      <button className="icon-button" type="submit" title="Sign out" aria-label="Sign out">
        <LogOut aria-hidden="true" />
      </button>
    </form>
  );
}
