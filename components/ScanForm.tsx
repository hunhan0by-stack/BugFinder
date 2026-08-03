import type { ReactNode, RefObject } from "react";

type ScanFormProps = {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  errorMessage: string | null;
  submitDescribedBy: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isPending: boolean;
  submitDisabled: boolean;
  children: ReactNode;
};

const HINT_ID = "scan-url-hint";
const ERROR_ID = "scan-url-error";

export default function ScanForm({
  url,
  onUrlChange,
  onSubmit,
  errorMessage,
  submitDescribedBy,
  inputRef,
  isPending,
  submitDisabled,
  children,
}: ScanFormProps) {
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <label htmlFor="scan-url" className="block text-sm font-semibold">
          Website address
        </label>
        <p id={HINT_ID} className="text-muted mt-1 text-sm">
          Paste the full address, including http:// or https://, for example
          https://example.com/pricing
        </p>
        <input
          id="scan-url"
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://example.com"
          value={url}
          disabled={isPending}
          onChange={(event) => onUrlChange(event.target.value)}
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage ? `${HINT_ID} ${ERROR_ID}` : HINT_ID}
          className="border-line focus:border-accent mt-2 block w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
        />
        {errorMessage ? (
          <p
            id={ERROR_ID}
            role="alert"
            className="mt-2 text-sm font-medium text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>

      {children}

      <button
        type="submit"
        disabled={submitDisabled}
        aria-describedby={submitDescribedBy}
        className="bg-accent hover:bg-accent-hover focus-visible:ring-accent w-full rounded-xl px-4 py-2.5 font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isPending ? "Opening Website…" : "Scan Website"}
      </button>
    </form>
  );
}
