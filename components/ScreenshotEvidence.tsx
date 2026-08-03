import Image from "next/image";
import type { BasicScreenshotResult } from "@/types/scan";

export default function ScreenshotEvidence({
  screenshot,
  hostname,
}: {
  screenshot: BasicScreenshotResult;
  hostname: string;
}) {
  return (
    <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold">Desktop screenshot</h3>

      {!screenshot.requested ? (
        <p className="text-muted mt-2 text-sm">
          Desktop screenshot was not requested.
        </p>
      ) : null}

      {screenshot.requested && !screenshot.available ? (
        <p className="text-muted mt-2 text-sm">
          {screenshot.reason ??
            "The page opened successfully, but the desktop screenshot could not be created."}
        </p>
      ) : null}

      {screenshot.available && screenshot.publicUrl ? (
        <div className="mt-3 space-y-3">
          <p className="text-muted text-sm">
            Capture mode:{" "}
            {screenshot.captureMode === "FULL_PAGE"
              ? "Full page"
              : "Viewport only"}
            {screenshot.width && screenshot.height
              ? ` · ${screenshot.width}×${screenshot.height}`
              : ""}
          </p>
          {screenshot.reason ? (
            <p className="text-muted text-sm">{screenshot.reason}</p>
          ) : null}
          <Image
            src={screenshot.publicUrl}
            alt={`Desktop screenshot captured during the basic scan of ${hostname}`}
            width={screenshot.width ?? 1366}
            height={screenshot.height ?? 768}
            unoptimized
            className="border-line max-h-[480px] w-full rounded-xl border object-contain bg-neutral-50"
          />
          <p>
            <a
              href={screenshot.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent text-sm font-medium underline-offset-2 hover:underline"
            >
              Open full screenshot
            </a>
          </p>
          <p className="text-muted text-xs leading-relaxed">
            Screenshots are stored locally in this project&rsquo;s scan-results
            directory. Do not scan pages containing sensitive information unless
            you are authorized to store the resulting image.
          </p>
        </div>
      ) : null}
    </div>
  );
}
