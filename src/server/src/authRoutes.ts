import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { z } from "zod";

const execAsync = promisify(exec);

type AzureAccount = {
  id: string;
  name: string;
  tenantId: string;
  tenantDisplayName?: string;
  user?: {
    name?: string;
    type?: string;
  };
};

type LoginState = {
  status: "idle" | "running" | "succeeded" | "failed";
  verificationUrl?: string;
  userCode?: string;
  message?: string;
  account?: AzureAccount;
};

const setSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1)
});

let loginState: LoginState = { status: "idle" };
let loginProcessRunning = false;

export function createAuthRouter(): Router {
  const router = Router();

  router.get("/status", async (_req, res) => {
    res.json(await getStatus());
  });

  router.post("/logout", async (_req, res, next) => {
    try {
      await execAsync("az logout", { maxBuffer: 1024 * 1024 }).catch(() => undefined);
      loginState = { status: "idle" };
      res.json(await getStatus());
    } catch (error) {
      next(error);
    }
  });

  router.post("/login/start", (_req, res) => {
    if (loginProcessRunning) {
      res.json(loginState);
      return;
    }

    loginState = {
      status: "running",
      message: "Waiting for Azure CLI device-code sign-in."
    };
    loginProcessRunning = true;

    const command =
      process.platform === "win32"
        ? "az logout & az config set core.login_experience_v2=off & az login --use-device-code --output json"
        : "az logout; az config set core.login_experience_v2=off; az login --use-device-code --output json";

    const child = exec(command, { maxBuffer: 1024 * 1024 * 20 }, async (error) => {
      loginProcessRunning = false;

      if (error) {
        loginState = {
          ...loginState,
          status: "failed",
          message: error.message
        };
        return;
      }

      const status = await getStatus();
      loginState = {
        status: status.signedIn ? "succeeded" : "failed",
        message: status.signedIn ? "Signed in." : "Sign-in finished, but no active Azure account was found.",
        account: status.account
      };
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      updateLoginStateFromOutput(chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      updateLoginStateFromOutput(chunk.toString());
    });

    res.json(loginState);
  });

  router.get("/login/status", (_req, res) => {
    res.json(loginState);
  });

  router.post("/subscription", async (req, res, next) => {
    try {
      const payload = setSubscriptionSchema.parse(req.body);
      await execAsync(`az account set --subscription ${JSON.stringify(payload.subscriptionId)}`, {
        maxBuffer: 1024 * 1024
      });
      res.json(await getStatus());
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function getStatus(): Promise<{ signedIn: boolean; account?: AzureAccount; subscriptions: AzureAccount[] }> {
  const [account, subscriptions] = await Promise.all([getCurrentAccount(), getSubscriptions()]);

  return {
    signedIn: Boolean(account),
    account,
    subscriptions
  };
}

async function getCurrentAccount(): Promise<AzureAccount | undefined> {
  try {
    const { stdout } = await execAsync("az account show --output json", { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout) as AzureAccount;
  } catch {
    return undefined;
  }
}

async function getSubscriptions(): Promise<AzureAccount[]> {
  try {
    const { stdout } = await execAsync("az account list --output json", { maxBuffer: 1024 * 1024 * 5 });
    return JSON.parse(stdout) as AzureAccount[];
  } catch {
    return [];
  }
}

function updateLoginStateFromOutput(output: string): void {
  const codeMatch = output.match(/enter the code\s+([A-Z0-9]+)\s+to authenticate/i);
  const urlMatch = output.match(/open the page\s+(https?:\/\/\S+)/i);

  loginState = {
    ...loginState,
    verificationUrl: urlMatch?.[1] ?? loginState.verificationUrl,
    userCode: codeMatch?.[1] ?? loginState.userCode,
    message: output.trim() || loginState.message
  };
}
