import { CREDENTIAL_ORIGIN, CREDENTIAL_REALM } from "../constants";

const USERNAME = "openai";

function loginManager(): any {
  return (Services as any).logins;
}

async function findLogins(): Promise<any[]> {
  try {
    return (
      (await loginManager().searchLoginsAsync({
        origin: CREDENTIAL_ORIGIN,
        httpRealm: CREDENTIAL_REALM,
      })) || []
    );
  } catch {
    return [];
  }
}

export class CredentialService {
  async get(): Promise<string> {
    const login = (await findLogins()).find((entry) => entry.username === USERNAME);
    return typeof login?.password === "string" ? login.password : "";
  }

  async has(): Promise<boolean> {
    return (await this.get()).length > 0;
  }

  async set(apiKey: string): Promise<void> {
    await this.clear();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    const LoginInfo = new (Components as any).Constructor(
      "@mozilla.org/login-manager/loginInfo;1",
      (Components as any).interfaces.nsILoginInfo,
      "init",
    );
    const login = new LoginInfo(
      CREDENTIAL_ORIGIN,
      null,
      CREDENTIAL_REALM,
      USERNAME,
      trimmed,
      "",
      "",
    );
    await loginManager().addLoginAsync(login);
  }

  async clear(): Promise<void> {
    for (const login of await findLogins()) {
      try {
        loginManager().removeLogin(login);
      } catch (error) {
        Zotero.logError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
