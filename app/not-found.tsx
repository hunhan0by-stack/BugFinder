import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-[1100px] flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted max-w-xl text-sm leading-relaxed">
        That address is not part of Frontend Bug Finder. Return to the home page
        to configure a scan.
      </p>
      <Link
        href="/"
        className="bg-accent hover:bg-accent-hover focus-visible:ring-accent w-fit rounded-xl px-4 py-2.5 font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Back to scanner
      </Link>
    </main>
  );
}
