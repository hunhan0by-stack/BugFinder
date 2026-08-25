"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900">
        <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col gap-4 px-4 py-12">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-xl text-sm leading-relaxed text-neutral-600">
            The application could not render this page. You can try again or
            reload Frontend Bug Finder.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="w-fit rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
