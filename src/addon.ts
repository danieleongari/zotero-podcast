import { config } from "../package.json";
import hooks from "./hooks";
import { CredentialService } from "./services/credentials";
import { JobManager } from "./services/jobManager";
import { OpenAIClient } from "./services/openai";
import { validateOutputDirectory } from "./services/output";
import { SelectionService } from "./services/selection";
import { SettingsService } from "./services/settings";
import { MenuService } from "./ui/menus";
import { WindowManager } from "./ui/windowManager";

class Addon {
  public data: {
    alive: boolean;
    initialized: boolean;
    config: typeof config;
    env: "development" | "production";
  };

  public readonly credentials = new CredentialService();
  public readonly settings = new SettingsService();
  public readonly selection = new SelectionService();
  public readonly jobs = new JobManager(this.credentials);
  public readonly windows = new WindowManager(
    rootURI,
    this.selection,
    this.settings,
    this.credentials,
    this.jobs,
  );
  public readonly menus = new MenuService(this.selection, this.windows);
  public readonly hooks = hooks;

  constructor() {
    this.data = {
      alive: true,
      initialized: false,
      config,
      env: (__env__ || "production") as "development" | "production",
    };
  }

  getAPIKey(): string {
    return this.credentials.get();
  }

  setAPIKey(value: string): void {
    this.credentials.set(value);
  }

  clearAPIKey(): void {
    this.credentials.clear();
  }

  async testAPIKey(value: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await new OpenAIClient(value.trim(), controller.signal).testConnection();
    } finally {
      clearTimeout(timer);
    }
  }

  async validateOutputDirectory(value: string): Promise<void> {
    await validateOutputDirectory(value);
  }
}

export default Addon;
