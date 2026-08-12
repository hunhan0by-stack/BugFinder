import { SCAN_OPTION_DEFINITIONS } from "@/lib/utils/scan-options";
import type { ScanOptionKey, ScanOptions } from "@/types/scan";

type ScanOptionsProps = {
  value: ScanOptions;
  onToggle: (key: ScanOptionKey, checked: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  disabled: boolean;
  errorMessage: string | null;
};

const ERROR_ID = "scan-options-error";

const BULK_BUTTON_CLASSES =
  "border-line bg-panel focus-visible:ring-accent rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export default function ScanOptionsFieldset({
  value,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled,
  errorMessage,
}: ScanOptionsProps) {
  return (
    <fieldset aria-describedby={errorMessage ? ERROR_ID : undefined}>
      <legend className="text-sm font-semibold">Checks to include</legend>
      <p className="text-muted mt-1 text-sm">
        Selected checks run during this single-page visit, including console,
        network, broken images, mobile layout, accessibility, screenshots, and
        optional safe interaction checks.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={disabled}
          className={BULK_BUTTON_CLASSES}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onClearAll}
          disabled={disabled}
          className={BULK_BUTTON_CLASSES}
        >
          Clear all
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {SCAN_OPTION_DEFINITIONS.map((option) => {
          const inputId = `scan-option-${option.key}`;
          const descriptionId = `${inputId}-description`;

          return (
            <li key={option.key}>
              <label
                htmlFor={inputId}
                className="border-line flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors hover:bg-neutral-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value[option.key]}
                  disabled={disabled}
                  onChange={(event) =>
                    onToggle(option.key, event.target.checked)
                  }
                  aria-describedby={descriptionId}
                  className="accent-accent mt-1 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span
                    id={descriptionId}
                    className="text-muted mt-0.5 block text-sm"
                  >
                    {option.description}
                  </span>
                  {option.warning ? (
                    <span className="mt-1 block text-sm text-amber-800">
                      {option.warning}
                    </span>
                  ) : null}
                  {option.key === "reversibleWorkflows" &&
                  value.reversibleWorkflows &&
                  value.safeInteractions ? (
                    <span className="text-muted mt-1 block text-sm">
                      Safe interaction checks stay selected because reversible
                      workflows reuse that safety infrastructure.
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="text-muted mt-3 text-sm leading-relaxed">
        Interaction coverage is intentionally limited. Controls that may cause
        side effects are skipped rather than clicked.
      </p>

      {errorMessage ? (
        <p
          id={ERROR_ID}
          role="alert"
          className="mt-3 text-sm font-medium text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}
    </fieldset>
  );
}
