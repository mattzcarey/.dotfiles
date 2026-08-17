import {
	DEFAULT_ROUTE_HEADERS,
	DEFAULT_ROUTE_URLS,
	ENABLED_BACKENDS,
	type Backend,
	EXPIRY_SAFETY_BUFFER_MS,
	GATEWAY_ORIGIN,
	TOKEN_ENV_OVERRIDE,
	WELL_KNOWN_CACHE_TTL_MS,
	WELL_KNOWN_URL,
} from "./constants.ts";

export interface GatewayModelLimit {
	context?: number;
	output?: number;
}

export interface GatewayModelModalities {
	input?: ("text" | "image")[];
	output?: string[];
}

export interface GatewayModelConfig {
	id?: string;
	name?: string;
	attachment?: boolean;
	reasoning?: boolean;
	tool_call?: boolean;
	temperature?: boolean;
	interleaved?: { field?: string };
	modalities?: GatewayModelModalities;
	limit?: GatewayModelLimit;
	options?: Record<string, unknown>;
}

export interface GatewayRouteConfig {
	baseUrl: string;
	headers: Record<string, string>;
	models: Record<string, GatewayModelConfig>;
}

export interface GatewayProviderConfig {
	name?: string;
	options?: {
		baseURL?: string;
		baseUrl?: string;
		headers?: Record<string, unknown>;
	};
	models?: Record<string, GatewayModelConfig>;
}

export interface GatewayRemoteConfig {
	enabled_providers?: string[];
	provider?: Record<string, GatewayProviderConfig>;
}

export interface GatewayWellKnownResponse {
	auth?: {
		command?: string | string[];
		env?: string;
	};
	remote_config?: {
		url?: string;
		headers?: Record<string, unknown>;
	};
	config?: GatewayRemoteConfig;
}

export interface ResolvedGatewayConfig {
	origin: string;
	authEnv: string;
	authCommand?: string | string[];
	enabledBackends: Backend[];
	routes: Record<Backend, GatewayRouteConfig>;
	raw?: GatewayWellKnownResponse;
}

let cachedGatewayConfig: { expiresAt: number; value: ResolvedGatewayConfig } | undefined;

export function isAllowedGatewayOrigin(input: string): boolean {
	try {
		return new URL(input).origin === new URL(GATEWAY_ORIGIN).origin;
	} catch {
		return false;
	}
}

export function normalizeGatewayOrigin(input: string): string {
	const url = new URL(input);
	url.hash = "";
	url.search = "";
	url.pathname = "";
	return url.origin;
}

function mapProviderId(providerId: string): Backend | undefined {
	if (providerId === "cloudflare-workers-ai") return "workers-ai";
	return ENABLED_BACKENDS.find((backend) => backend === providerId);
}

function normalizeBackendList(enabledProviders: string[] | undefined): Backend[] {
	if (!enabledProviders?.length) return [...ENABLED_BACKENDS];
	const enabled = new Set(
		enabledProviders.map(mapProviderId).filter((backend): backend is Backend => Boolean(backend)),
	);
	return ENABLED_BACKENDS.filter((backend) => enabled.has(backend));
}

function normalizeHeaders(headers: Record<string, unknown> | undefined, backend: Backend): Record<string, string> {
	const resolved: Record<string, string> = { ...DEFAULT_ROUTE_HEADERS[backend] };
	for (const [key, value] of Object.entries(headers || {})) {
		if (typeof value === "string" && value.trim()) {
			resolved[key] = value;
		}
	}

	if (backend === "anthropic" && resolved["anthropic-beta"]) {
		const mergedValues = new Set(
			resolved["anthropic-beta"]
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
		mergedValues.add("fine-grained-tool-streaming-2025-05-14");
		resolved["anthropic-beta"] = Array.from(mergedValues).join(",");
	}

	return resolved;
}

function getRouteProviderConfig(raw: GatewayWellKnownResponse["config"], backend: Backend) {
	const providers = raw?.provider;
	if (!providers) return undefined;
	if (backend === "workers-ai") {
		return providers["workers-ai"] || providers["cloudflare-workers-ai"];
	}
	return providers[backend];
}

function resolveRouteConfig(raw: GatewayWellKnownResponse | undefined, backend: Backend): GatewayRouteConfig {
	const providerConfig = getRouteProviderConfig(raw?.config, backend);
	const options = providerConfig?.options;

	return {
		baseUrl: options?.baseURL || options?.baseUrl || DEFAULT_ROUTE_URLS[backend],
		headers: normalizeHeaders(options?.headers, backend),
		models: providerConfig?.models || {},
	};
}

function resolveGatewayConfig(raw: GatewayWellKnownResponse | undefined): ResolvedGatewayConfig {
	const enabledBackends = normalizeBackendList(raw?.config?.enabled_providers);
	return {
		origin: GATEWAY_ORIGIN,
		authEnv: raw?.auth?.env || "TOKEN",
		authCommand: raw?.auth?.command,
		enabledBackends,
		routes: {
			anthropic: resolveRouteConfig(raw, "anthropic"),
			openai: resolveRouteConfig(raw, "openai"),
			xai: resolveRouteConfig(raw, "xai"),
			"workers-ai": resolveRouteConfig(raw, "workers-ai"),
		},
		raw,
	};
}

export function getDefaultGatewayConfig(): ResolvedGatewayConfig {
	return resolveGatewayConfig(undefined);
}

export function clearGatewayConfigCache(): void {
	cachedGatewayConfig = undefined;
}

export async function getGatewayConfig(options?: {
	forceReload?: boolean;
	fallbackToDefault?: boolean;
	token?: string;
}): Promise<ResolvedGatewayConfig> {
	const forceReload = options?.forceReload === true;
	const fallbackToDefault = options?.fallbackToDefault !== false;
	const now = Date.now();

	if (!forceReload && cachedGatewayConfig && cachedGatewayConfig.expiresAt > now) {
		return cachedGatewayConfig.value;
	}

	try {
		const response = await fetch(WELL_KNOWN_URL, {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new Error(`Gateway well-known request failed: ${response.status} ${response.statusText}`);
		}

		const wellKnown = (await response.json()) as GatewayWellKnownResponse;
		const raw = await mergeRemoteConfig(wellKnown, options?.token);
		const resolved = resolveGatewayConfig(raw);
		cachedGatewayConfig = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value: resolved };
		return resolved;
	} catch (error) {
		if (!fallbackToDefault) {
			throw error;
		}
		const fallback = getDefaultGatewayConfig();
		cachedGatewayConfig = { expiresAt: now + WELL_KNOWN_CACHE_TTL_MS, value: fallback };
		return fallback;
	}
}

export function stripRoutePrefix(modelId: string, backend: Backend): string {
	switch (backend) {
		case "anthropic":
			return modelId.replace(/^anthropic\//, "");
		case "workers-ai":
			return modelId.replace(/^workers-ai\//, "");
		default:
			return modelId;
	}
}

export function applyGatewayToken(
	headers: Record<string, string> | undefined,
	authEnv: string,
	token: string,
): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers || {})) {
		resolved[key] = value.replace(new RegExp(`\\{env:${escapeRegExp(authEnv)}\\}`, "g"), token);
	}
	if (!resolved["cf-access-token"]) {
		resolved["cf-access-token"] = token;
	}
	if (!resolved["X-Requested-With"]) {
		resolved["X-Requested-With"] = "xmlhttprequest";
	}
	return resolved;
}

export function resolvePreferredToken(passedApiKey?: string): string | undefined {
	if (passedApiKey?.trim()) return passedApiKey.trim();
	if (process.env[TOKEN_ENV_OVERRIDE]?.trim()) return process.env[TOKEN_ENV_OVERRIDE]?.trim();
	return undefined;
}

async function mergeRemoteConfig(wellKnown: GatewayWellKnownResponse, token?: string): Promise<GatewayWellKnownResponse> {
	const remoteUrl = wellKnown.remote_config?.url?.trim();
	if (!remoteUrl || !token) return wellKnown;
	if (!isAllowedGatewayOrigin(remoteUrl)) {
		throw new Error(`Refusing remote config from untrusted origin: ${remoteUrl}`);
	}

	const headers = applyGatewayToken(
		normalizeHeaders(wellKnown.remote_config?.headers, "openai"),
		wellKnown.auth?.env || "TOKEN",
		token,
	);
	const response = await fetch(remoteUrl, {
		method: "GET",
		headers: { Accept: "application/json", ...headers },
	});
	if (!response.ok) {
		throw new Error(`Gateway remote config request failed: ${response.status} ${response.statusText}`);
	}

	const remote = (await response.json()) as GatewayRemoteConfig;
	return {
		...wellKnown,
		config: {
			enabled_providers: remote.enabled_providers,
			provider: remote.provider,
		},
	};
}

export function getGatewayTokenExpiry(token: string): number | undefined {
	const parts = token.split(".");
	if (parts.length < 2) return undefined;
	try {
		const payload = JSON.parse(Buffer.from(base64UrlToBase64(parts[1] || ""), "base64").toString("utf8")) as {
			exp?: number;
		};
		if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
			return payload.exp * 1000 - EXPIRY_SAFETY_BUFFER_MS;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function base64UrlToBase64(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const remainder = normalized.length % 4;
	if (remainder === 0) return normalized;
	return normalized.padEnd(normalized.length + (4 - remainder), "=");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
