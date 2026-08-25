import AuthorizedUseNotice from "@/components/AuthorizedUseNotice";
import ProductHeader from "@/components/ProductHeader";
import ScanWorkspace from "@/components/ScanWorkspace";
import TestingLimitationsNotice from "@/components/TestingLimitationsNotice";

export default function Home() {
  return (
    <>
      <a
        href="#main-content"
        className="bg-panel focus:ring-accent sr-only rounded-lg px-4 py-2 font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:ring-2"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <ProductHeader />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-col gap-8 outline-none"
        >
          <AuthorizedUseNotice />

          <ScanWorkspace />

          <TestingLimitationsNotice />
        </main>

        <footer className="border-line text-muted border-t pt-6 text-sm">
          <p>
            Frontend Bug Finder — local release. The scanner opens one authorized
            page and runs selected diagnostics, optional safe interactions,
            issue evidence, and reversible local workflows.
          </p>
          <p className="mt-1">
            Use only on websites you own or are authorized to test.
          </p>
        </footer>
      </div>
    </>
  );
}
