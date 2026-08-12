import type { Page, Request } from "playwright";

export type InteractionGateStats = {
  networkAttempts: number;
  navigationAttempts: number;
  popupAttempts: number;
  downloadAttempts: number;
  submitAttempts: number;
  fileChooserAttempts: number;
};

/**
 * Strict per-click gate: abort all network, block navigation side effects,
 * close popups, cancel downloads, and prevent form submission.
 */
export async function attachStrictInteractionGate(
  page: Page,
  intentionalAborts: WeakSet<Request>,
): Promise<{
  getStats: () => InteractionGateStats;
  dispose: () => Promise<void>;
}> {
  const stats: InteractionGateStats = {
    networkAttempts: 0,
    navigationAttempts: 0,
    popupAttempts: 0,
    downloadAttempts: 0,
    submitAttempts: 0,
    fileChooserAttempts: 0,
  };

  const onPopup = async (popup: Page) => {
    stats.popupAttempts += 1;
    try {
      await popup.close();
    } catch {
      // ignore
    }
  };

  const onDownload = async (download: {
    cancel: () => Promise<void>;
  }) => {
    stats.downloadAttempts += 1;
    try {
      await download.cancel();
    } catch {
      // ignore
    }
  };

  const onFileChooser = async () => {
    stats.fileChooserAttempts += 1;
  };

  const onFramenavigated = () => {
    stats.navigationAttempts += 1;
  };

  page.on("popup", onPopup);
  page.on("download", onDownload);
  page.on("filechooser", onFileChooser);
  page.on("framenavigated", onFramenavigated);

  await page.route("**/*", async (route) => {
    const request = route.request();
    intentionalAborts.add(request);
    stats.networkAttempts += 1;
    if (request.isNavigationRequest()) {
      stats.navigationAttempts += 1;
    }
    try {
      await route.abort("blockedbyclient");
    } catch {
      // ignore races
    }
  });

  await page.evaluate(() => {
    const marker = "__fbf_submit_blocker__";
    const win = window as unknown as Record<string, unknown>;
    if (win[marker]) return;
    const handler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      (
        window as unknown as { __fbf_submit_attempts?: number }
      ).__fbf_submit_attempts =
        ((window as unknown as { __fbf_submit_attempts?: number })
          .__fbf_submit_attempts ?? 0) + 1;
    };
    document.addEventListener("submit", handler, true);
    win[marker] = handler;
  });

  return {
    getStats: () => {
      return { ...stats };
    },
    dispose: async () => {
      page.off("popup", onPopup);
      page.off("download", onDownload);
      page.off("filechooser", onFileChooser);
      page.off("framenavigated", onFramenavigated);
      try {
        await page.unroute("**/*");
      } catch {
        // ignore
      }
      try {
        const submitAttempts = await page.evaluate(() => {
          return (
            (window as unknown as { __fbf_submit_attempts?: number })
              .__fbf_submit_attempts ?? 0
          );
        });
        stats.submitAttempts += submitAttempts;
      } catch {
        // page may be closed
      }
    },
  };
}
