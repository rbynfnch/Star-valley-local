import Link from "next/link";

// Placeholder until slice 2 (public directory). Intentionally tiny: it only proves the tokens are wired up.
export default function Home() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-[var(--container-max)] flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">Star Valley Local</p>
      <h1 className="font-heading text-4xl font-bold sm:text-5xl">Find Local. Discover More. Support Star Valley.</h1>
      <p className="max-w-prose text-lg text-text-muted">The directory is being built. This page is a placeholder.</p>
      {process.env.NODE_ENV !== "production" && (
        <p>
          <Link href="/styleguide" className="font-medium underline underline-offset-4">
            Open the styleguide
          </Link>
        </p>
      )}
    </main>
  );
}
