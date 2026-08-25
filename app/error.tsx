"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full max-w-[1100px] flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted max-w-xl text-sm leading-relaxed">
        The page could not be displayed. Your scan request was not sent again.
        You can return to the scanner and try once more.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="bg-accent hover:bg-accent-hover focus-visible:ring-accent w-fit rounded-xl px-4 py-2.5 font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Try again
      </button>
    </main>
  );
}
