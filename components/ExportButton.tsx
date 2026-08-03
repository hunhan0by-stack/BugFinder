import { useState } from "react";
import { basicScanExportFileName } from "@/lib/utils/basic-scan-export-filename";
import type { BasicScanResult } from "@/types/scan";

export default function ExportButton({ result }: { result: BasicScanResult }) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function handleExport() {
    const fileName = basicScanExportFileName(result.targetUrl);
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);

    setStatusMessage(`Basic scan report downloaded as ${fileName}`);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        className="border-line bg-panel focus-visible:ring-accent w-full rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
      >
        Export JSON
      </button>
      <p role="status" aria-live="polite" className="text-muted mt-2 text-xs">
        {statusMessage}
      </p>
    </div>
  );
}
