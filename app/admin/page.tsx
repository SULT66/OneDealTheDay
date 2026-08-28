import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/AdminConsole";

/**
 * The admin console.
 *
 * Outside the [market] segment on purpose: it is one console for every market,
 * and it has no business wearing the shopper header, the category row or the
 * newsletter footer.
 *
 * noindex, and nothing here renders without the key — the page itself is only
 * a form, and every answer it can show comes from a request that carries the
 * key with it.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminConsole />;
}
