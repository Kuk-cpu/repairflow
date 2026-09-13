import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";

export default async function TasksPage() { await requireViewer(["CONTRACTOR"]); redirect("/tickets"); }
