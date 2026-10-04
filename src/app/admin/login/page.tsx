import { authConfigured } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/admin/access";
import { getTenant } from "@/lib/tenant/resolve";
import { LoginForm } from "./LoginForm";
import { signOut } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const denied = sp.denied === "1";
  const tenant = await getTenant();
  return (
    <main id="main" className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold text-text">{tenant ? `${tenant.name} admin` : "Admin"}</h1>
      <p className="mt-1 text-sm text-text-muted">Staff sign-in.</p>
      {!authConfigured() && <p role="alert" className="mt-6 rounded-card bg-surface-muted p-3 text-sm">Sign-in is not configured on this server (Supabase keys missing).</p>}
      {denied && (
        <div role="alert" className="mt-6 rounded-card bg-surface-muted p-3 text-sm">
          <p>That account is not staff for this site.</p>
          <form action={signOut} className="mt-2"><button className="font-medium text-link underline">Sign out and try another account</button></form>
        </div>
      )}
      {authConfigured() && !denied && <div className="mt-6"><LoginForm next={next} /></div>}
    </main>
  );
}
