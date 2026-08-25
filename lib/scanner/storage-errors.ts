import "server-only";

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function isInsufficientStorageError(error: unknown): boolean {
  return errorCode(error) === "ENOSPC";
}

export function isPermissionStorageError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "EACCES" || code === "EPERM";
}

export function isStorageFailureError(error: unknown): boolean {
  return isInsufficientStorageError(error) || isPermissionStorageError(error);
}

export function storageFailureNotice(error: unknown): string | null {
  if (isInsufficientStorageError(error)) {
    return "Local storage is full. Diagnostic findings were preserved without this image.";
  }
  if (isPermissionStorageError(error)) {
    return "Local storage could not be written. Diagnostic findings were preserved without this image.";
  }
  return null;
}
