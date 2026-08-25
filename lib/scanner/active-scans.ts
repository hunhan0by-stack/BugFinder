import "server-only";

/**
 * In-process set of scan IDs that currently own artifact directories.
 * Retention must never delete these.
 */
class ActiveScanRegistry {
  private readonly ids = new Set<string>();

  add(scanId: string): void {
    this.ids.add(scanId);
  }

  remove(scanId: string): void {
    this.ids.delete(scanId);
  }

  has(scanId: string): boolean {
    return this.ids.has(scanId);
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.ids);
  }

  /** Test helper */
  reset(): void {
    this.ids.clear();
  }
}

export const activeScans = new ActiveScanRegistry();
