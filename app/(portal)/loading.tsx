import { LoaderCircle } from "lucide-react";

export default function PortalLoading() {
  return <div className="page-state" role="status"><LoaderCircle className="spin" aria-hidden="true" /><strong>Loading workspace</strong><span>Checking the latest work order data.</span></div>;
}
