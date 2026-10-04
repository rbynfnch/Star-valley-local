import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-24 text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <p className="text-text-muted">We couldn&apos;t find what you were looking for.</p>
      <p><Link href="/" className="font-semibold underline underline-offset-4">Go to the home page</Link></p>
    </main>
  );
}
