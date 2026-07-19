function domHost(): any {
  if (typeof Zotero !== "undefined") {
    const mainWindow = Zotero.getMainWindow?.();
    if (mainWindow) return mainWindow;
  }
  if (typeof Services !== "undefined") {
    const hiddenWindow = (Services as any).appShell?.hiddenDOMWindow;
    if (hiddenWindow) return hiddenWindow;
  }
  return globalThis;
}

export function createAbortController(): AbortController {
  const AbortControllerConstructor = domHost().AbortController;
  if (!AbortControllerConstructor) {
    throw new Error("This Zotero runtime does not provide AbortController.");
  }
  return new AbortControllerConstructor();
}

export function abortError(): Error {
  const error = new Error("Cancelled");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function runtimeSetTimeout(callback: () => void, milliseconds: number): any {
  return domHost().setTimeout(callback, milliseconds);
}

export function runtimeClearTimeout(timer: any): void {
  domHost().clearTimeout(timer);
}

export function runtimeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return domHost().fetch(input, init);
}
