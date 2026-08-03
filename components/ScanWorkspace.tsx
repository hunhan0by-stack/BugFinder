"use client";

import { useRef, useState } from "react";
import BasicScanReport from "./BasicScanReport";
import EmptyReportState from "./EmptyReportState";
import PlannedChecksPanel from "./PlannedChecksPanel";
import ScanForm from "./ScanForm";
import ScanOptionsFieldset from "./ScanOptions";
import {
  DEFAULT_SCAN_OPTIONS,
  countSelectedOptions,
  setAllScanOptions,
} from "@/lib/utils/scan-options";
import {
  NO_OPTION_SELECTED_MESSAGE,
  checkWebsiteUrl,
  firstFieldError,
} from "@/lib/validation/scan-schema";
import {
  parseScanErrorResponse,
  parseScanResult,
} from "@/lib/validation/scan-response";
import type {
  BasicScanResult,
  ScanOptionKey,
  ScanOptions,
  ScanRequestInput,
} from "@/types/scan";

const BACKEND_STATUS_ID = "scanner-backend-status";

const REQUEST_FAILED_MESSAGE =
  "The basic scan could not be completed because the local request failed. Check that the development server is still running, then try again.";
const UNEXPECTED_RESPONSE_MESSAGE =
  "The scanner API returned a response this interface could not read. No report was created.";

export default function ScanWorkspace() {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_SCAN_OPTIONS);
  const [isPending, setIsPending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [urlRequestError, setUrlRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<BasicScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const urlCheck = checkWebsiteUrl(url);
  const selectedCount = countSelectedOptions(options);

  const urlError =
    urlRequestError ?? (url.trim() !== "" && !urlCheck.ok ? urlCheck.message : null);
  const optionsError = selectedCount === 0 ? NO_OPTION_SELECTED_MESSAGE : null;
  const submitDisabled = isPending || !urlCheck.ok || selectedCount === 0;

  function discardPreviousReport() {
    setResult(null);
    setRequestError(null);
    setUrlRequestError(null);
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    discardPreviousReport();
  }

  function handleToggle(key: ScanOptionKey, checked: boolean) {
    setOptions((previous) => ({ ...previous, [key]: checked }));
    discardPreviousReport();
  }

  function handleSelectAll() {
    setOptions(setAllScanOptions(true));
    discardPreviousReport();
  }

  function handleClearAll() {
    setOptions(setAllScanOptions(false));
    discardPreviousReport();
  }

  async function handleSubmit() {
    if (isPending) return;

    discardPreviousReport();

    if (!urlCheck.ok) {
      setUrlRequestError(urlCheck.message);
      inputRef.current?.focus();
      return;
    }

    if (selectedCount === 0) return;

    const payload: ScanRequestInput = { url: urlCheck.url, options };
    setIsPending(true);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const errorBody = parseScanErrorResponse(body);
        if (errorBody) {
          const fieldMessage = firstFieldError(errorBody.fieldErrors, "url");
          if (fieldMessage) {
            setUrlRequestError(fieldMessage);
            inputRef.current?.focus();
          }
          setRequestError(errorBody.error);
        } else {
          setRequestError(
            `${UNEXPECTED_RESPONSE_MESSAGE} (HTTP ${response.status})`,
          );
        }
        return;
      }

      const resultBody = parseScanResult(body);
      if (!resultBody) {
        setRequestError(UNEXPECTED_RESPONSE_MESSAGE);
        return;
      }

      setResult(resultBody);
    } catch {
      setRequestError(REQUEST_FAILED_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="scan-configuration-heading"
          className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6"
        >
          <h2 id="scan-configuration-heading" className="text-xl font-semibold">
            Configure a scan
          </h2>
          <p className="text-muted mt-1 text-sm">
            Choose an authorized page to open and the checks you want once later
            phases enable them.
          </p>

          <p
            id={BACKEND_STATUS_ID}
            className="border-line text-muted mt-4 rounded-xl border border-dashed px-4 py-3 text-sm"
          >
            <span className="text-foreground font-semibold">
              Phase 4 basic scanner.
            </span>{" "}
            The scanner currently opens one authorized page, records navigation
            metadata, and optionally captures one desktop screenshot. Diagnostic
            checks will be added in later phases.
          </p>

          <div className="mt-6">
            <ScanForm
              url={url}
              onUrlChange={handleUrlChange}
              onSubmit={handleSubmit}
              errorMessage={urlError}
              submitDescribedBy={BACKEND_STATUS_ID}
              inputRef={inputRef}
              isPending={isPending}
              submitDisabled={submitDisabled}
            >
              <ScanOptionsFieldset
                value={options}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
                disabled={isPending}
                errorMessage={optionsError}
              />
            </ScanForm>
          </div>

          <div role="status" aria-live="polite">
            {isPending ? (
              <p className="border-line mt-4 rounded-xl border bg-neutral-50 px-4 py-3 text-sm">
                Opening Website…
              </p>
            ) : null}
          </div>

          {requestError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {requestError}
            </p>
          ) : null}
        </section>

        <PlannedChecksPanel />
      </div>

      {result ? (
        <BasicScanReport key={result.scanId} result={result} />
      ) : (
        <EmptyReportState />
      )}
    </>
  );
}
