import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { createPropertyAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireViewer(["MANAGER"]);
  const [properties, notice] = await Promise.all([db.property.findMany({ include: { _count: { select: { tickets: true, assets: true, tenants: true } } }, orderBy: { name: "asc" } }), searchParams]);
  return <><header className="page-heading"><div><p className="eyebrow">Portfolio</p><h1>Properties</h1><p>Homes, active tenancies and maintenance history.</p></div></header>{notice.success ? <p className="alert success">{notice.success}</p> : null}{notice.error ? <p className="alert error">{notice.error}</p> : null}<div className="admin-grid"><section className="record-list">{properties.map((property) => <Link className="record-row" href={`/properties/${property.id}`} key={property.id}><span className="record-icon"><Building2 /></span><span><strong>{property.name}</strong><small>{property.addressLine}, {property.suburb} {property.postcode}</small></span><span>{property._count.tickets} repairs</span><span>{property._count.assets} assets</span></Link>)}</section><form className="form-panel" action={createPropertyAction}><div className="detail-title"><Plus /><h2>Add property</h2></div><div className="field"><label htmlFor="property-name">Name</label><input id="property-name" name="name" required /></div><div className="field"><label htmlFor="address-line">Address</label><input id="address-line" name="addressLine" required /></div><div className="field-row"><div className="field"><label htmlFor="suburb">Suburb</label><input id="suburb" name="suburb" required /></div><div className="field"><label htmlFor="postcode">Postcode</label><input id="postcode" name="postcode" inputMode="numeric" pattern="[0-9]{4}" required /></div></div><input type="hidden" name="state" value="NSW" /><button className="button button-primary">Add property</button></form></div></>;
}
