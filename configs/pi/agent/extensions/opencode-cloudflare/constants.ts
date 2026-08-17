export type Backend = "anthropic" | "openai" | "xai" | "workers-ai";

export const PROVIDER_ID = "opencode.cloudflare.dev";
export const PROVIDER_NAME = "OpenCode Cloudflare";
export const CUSTOM_API = "opencode-cloudflare";

export const GATEWAY_ORIGIN = "https://opencode.cloudflare.dev";
export const WELL_KNOWN_PATH = "/.well-known/opencode";
export const WELL_KNOWN_URL = `${GATEWAY_ORIGIN}${WELL_KNOWN_PATH}`;

export const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";
export const DEFAULT_TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000;
export const EXPIRY_SAFETY_BUFFER_MS = 5 * 60 * 1000;
export const WELL_KNOWN_CACHE_TTL_MS = 60 * 1000;

export const ENABLED_BACKENDS: Backend[] = ["anthropic", "openai", "xai", "workers-ai"];

// The gateway's config doesn't set these; without them the anthropic route
// loses 1M context, and a config-supplied anthropic-beta header would clobber
// the beta features pi-ai's client sets itself.
export const ANTHROPIC_BETAS = ["context-1m-2025-08-07", "fine-grained-tool-streaming-2025-05-14"];
