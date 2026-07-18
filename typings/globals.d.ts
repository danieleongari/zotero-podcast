declare const __env__: "development" | "production";
declare const rootURI: string;
declare const addon: import("../src/addon").default;
declare const _globalThis: typeof globalThis & {
  addon: import("../src/addon").default;
};
declare const document: Document;
declare const window: Window;

interface Window {
  arguments?: Array<{ wrappedJSObject?: unknown }>;
  ZoteroPodcastConfiguration?: {
    initialize(): Promise<void>;
  };
  ZoteroPodcastProgress?: {
    update(state: import("../src/types").ProgressState): void;
  };
}
