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
import { createAbortController, runtimeClearTimeout, runtimeSetTimeout } from "./utils/runtime";

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

  async getAPIKey(): Promise<string> {
    return this.credentials.get();
  }

  async setAPIKey(value: string): Promise<void> {
    await this.credentials.set(value);
  }

  async clearAPIKey(): Promise<void> {
    await this.credentials.clear();
  }

  async testAPIKey(value: string): Promise<void> {
    const controller = createAbortController();
    const timer = runtimeSetTimeout(() => controller.abort(), 15_000);
    try {
      await new OpenAIClient(value.trim(), controller.signal).testConnection();
    } finally {
      runtimeClearTimeout(timer);
    }
  }

  async validateOutputDirectory(value: string): Promise<void> {
    await validateOutputDirectory(value);
  }
}

export default Addon;
