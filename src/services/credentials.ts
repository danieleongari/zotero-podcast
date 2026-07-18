import { CREDENTIAL_ORIGIN, CREDENTIAL_REALM } from "../constants";

const USERNAME = "openai";

function loginManager(): any {
  return (Services as any).logins;
}

function findLogins(): any[] {
  try {
    return loginManager().findLogins(CREDENTIAL_ORIGIN, null, CREDENTIAL_REALM) || [];
  } catch {
    return [];
  }
}

export class CredentialService {
  get(): string {
    const login = findLogins().find((entry) => entry.username === USERNAME);
    return typeof login?.password === "string" ? login.password : "";
  }

  has(): boolean {
    return this.get().length > 0;
  }

  set(apiKey: string): void {
    this.clear();
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
    loginManager().addLogin(login);
  }

  clear(): void {
    for (const login of findLogins()) {
      try {
        loginManager().removeLogin(login);
      } catch (error) {
        Zotero.logError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
