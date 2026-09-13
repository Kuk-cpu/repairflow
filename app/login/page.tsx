import { redirect } from "next/navigation";
import { Building2, CheckCircle2, Wrench } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { getViewer } from "@/lib/session";

export default async function LoginPage() {
  if (await getViewer()) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand login-brand"><span className="brand-mark"><Wrench aria-hidden="true" /></span><span><strong>RepairFlow</strong><small>Maintenance operations</small></span></div>
        <div><p className="eyebrow">Harbour Homes workspace</p><h1>Keep every repair moving.</h1><p className="login-copy">A shared operating view for tenants, property managers and trusted contractors.</p></div>
        <div className="login-proof"><span><Building2 aria-hidden="true" /> Property-aware requests</span><span><CheckCircle2 aria-hidden="true" /> Clear ownership and approvals</span></div>
      </section>
      <section className="login-panel" aria-labelledby="sign-in-heading">
        <div><p className="eyebrow">Secure workspace</p><h2 id="sign-in-heading">Welcome back</h2><p>Sign in with an invited team account.</p></div>
        <LoginForm />
        {process.env.DEMO_MODE === "true" ? <div className="demo-note"><strong>Local demo mode</strong><span>Use a seeded account. This banner is disabled outside explicit demo environments.</span></div> : null}
      </section>
    </main>
  );
}
