import { Bell, Check, CheckCheck, Mail } from "lucide-react";
import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const notifications = await db.notification.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return <>
    <header className="page-heading"><div><p className="eyebrow">Updates</p><h1>Notifications</h1><p>In-app delivery history for your visible work.</p></div>{notifications.some((item) => !item.readAt) ? <form action={markAllNotificationsReadAction}><button className="button button-secondary"><CheckCheck aria-hidden="true" />Mark all read</button></form> : null}</header>
    <section className="notification-list">{notifications.length ? notifications.map((item) => <article key={item.id}><span className="record-icon">{item.channel === "EMAIL" ? <Mail /> : <Bell />}</span><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" }).format(item.createdAt)}</small></div>{item.readAt ? <Check /> : <span className="unread-dot" />}</article>) : <div className="empty-state"><Bell /><h3>No notifications</h3><p>Workflow updates will appear here.</p></div>}</section>
  </>;
}
