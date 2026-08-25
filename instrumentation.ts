export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { assertProductionFixtureDisabled } = await import(
    "@/lib/config/scanner-config"
  );
  assertProductionFixtureDisabled();

  const { cleanupExpiredArtifacts } = await import(
    "@/lib/scanner/artifact-retention"
  );
  await cleanupExpiredArtifacts({ force: true });
}
