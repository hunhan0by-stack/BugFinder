import Image from "next/image";
import type { BasicScreenshotResult } from "@/types/scan";

function ScreenshotPanel({
  title,
  screenshot,
  hostname,
  profileLabel,
}: {
  title: string;
  screenshot: BasicScreenshotResult;
  hostname: string;
  profileLabel: "Desktop" | "Mobile";
}) {
  return (
    <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold">{title}</h3>

      {!screenshot.requested ? (
        <p className="text-muted mt-2 text-sm">
          {profileLabel} screenshot was not requested.
        </p>
      ) : null}

      {screenshot.requested && !screenshot.available ? (
        <p className="text-muted mt-2 text-sm">
          {screenshot.reason ??
            `The page opened successfully, but the ${profileLabel.toLowerCase()} screenshot could not be created.`}
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
            alt={`${profileLabel} screenshot captured during the basic scan of ${hostname}`}
            width={screenshot.width ?? (profileLabel === "Mobile" ? 390 : 1366)}
            height={
              screenshot.height ?? (profileLabel === "Mobile" ? 844 : 768)
            }
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

export default function ScreenshotEvidence({
  screenshot,
  mobileScreenshot,
  hostname,
}: {
  screenshot: BasicScreenshotResult;
  mobileScreenshot?: BasicScreenshotResult;
  hostname: string;
}) {
  return (
    <div className="space-y-4">
      <ScreenshotPanel
        title="Desktop screenshot"
        screenshot={screenshot}
        hostname={hostname}
        profileLabel="Desktop"
      />
      {mobileScreenshot ? (
        <ScreenshotPanel
          title="Mobile screenshot"
          screenshot={mobileScreenshot}
          hostname={hostname}
          profileLabel="Mobile"
        />
      ) : null}
    </div>
  );
}
