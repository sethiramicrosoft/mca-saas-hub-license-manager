import { exec } from "node:child_process";
import { promisify } from "node:util";

export const ARM_BASE_URL = process.env.ARM_BASE_URL ?? "https://management.azure.com";
export const BILLING_API_VERSION = "2024-04-01";
export const SAAS_HUB_API_VERSION = "2025-07-01-preview";

const execAsync = promisify(exec);

export class ArmError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
  }
}

export type ArmResponse<T> = {
  body: T;
  azureAsyncOperation?: string;
  location?: string;
  retryAfter?: string;
};

export async function resolveArmToken(authorizationHeader: string | undefined): Promise<string> {
  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length).trim();
  }

  return getAzureCliToken();
}

export async function armRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<ArmResponse<T>> {
  const url = path.startsWith("https://") ? path : `${ARM_BASE_URL}${path}`;
  assertAllowedArmUrl(url);

  const response = await fetchWithRetry(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    throw new ArmError(`ARM request failed with ${response.status}.`, response.status, body);
  }

  return {
    body: body as T,
    azureAsyncOperation: response.headers.get("Azure-AsyncOperation") ?? undefined,
    location: response.headers.get("Location") ?? undefined,
    retryAfter: response.headers.get("Retry-After") ?? undefined
  };
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt === maxAttempts) {
        throw toArmNetworkError(error);
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw toArmNetworkError(new Error("Unknown ARM network error."));
}

function toArmNetworkError(error: unknown): ArmError {
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
  const causeMessage = cause instanceof Error ? cause.message : undefined;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;

  return new ArmError("Unable to reach Azure Resource Manager. Check network/VPN/proxy connectivity and try again.", 503, {
    code: "ArmNetworkUnavailable",
    message: error instanceof Error ? error.message : "Unknown network error.",
    cause: causeMessage,
    causeCode
  });
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function parseBody(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assertAllowedArmUrl(url: string): void {
  const parsed = new URL(url);
  const allowedHost = new URL(ARM_BASE_URL).host;

  if (parsed.host !== allowedHost) {
    throw new ArmError("Operation URL is not an Azure Resource Manager URL.", 400, {
      code: "InvalidOperationUrl"
    });
  }

  if (!parsed.pathname.startsWith("/providers/Microsoft.")) {
    throw new ArmError("Only tenant-scope Microsoft provider operations are supported.", 400, {
      code: "UnsupportedArmPath"
    });
  }
}

async function getAzureCliToken(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      "az account get-access-token --resource https://management.azure.com --output json",
      { maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout) as {
      accessToken?: string;
      expiresOnTimestamp?: number;
    };

    if (!parsed.accessToken) {
      throw new Error("Azure CLI returned no access token.");
    }

    return parsed.accessToken;
  } catch (error) {
    throw new ArmError("Unable to acquire an ARM token from Azure CLI. Run `az login` and try again.", 401, {
      code: "AzureCliTokenUnavailable",
      message: error instanceof Error ? error.message : "Unknown Azure CLI token error."
    });
  }
}
