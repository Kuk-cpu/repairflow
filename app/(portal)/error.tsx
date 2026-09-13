"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page-state error-state" role="alert"><AlertCircle aria-hidden="true" /><strong>We could not load this view</strong><span>The request was not completed. Your existing records have not been changed.</span><button className="button button-secondary" onClick={reset}><RotateCcw aria-hidden="true" />Try again</button></div>;
}
