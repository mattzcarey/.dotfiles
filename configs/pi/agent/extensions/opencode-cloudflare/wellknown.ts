import {
	ANTHROPIC_BETAS,
	type Backend,
	ENABLED_BACKENDS,
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

export interface GatewayRouteConfig {
	baseUrl: string;
	headers: Record<string, string>;
	models: Record<string, GatewayModelConfig>;
}

export interface ResolvedGatewayConfig {
	origin: string;
	authEnv: string;
	authCommand?: string | string[];
	enabledBackends: Backend[];
	routes: Partial<Record<Backend, GatewayRouteConfig>>;
}

let cachedGatewayConfig: { expiresAt: number; value: ResolvedGatewayConfig } | undefined;

export function isAllowedGatewayOrigin(input: string): boolean {
	try {
		return new URL(input).origin === new URL(GATEWAY_ORIGIN).origin;
	} catch {
		return false;
	}
}

function mapProviderId(providerId: string): Backend | undefined {
	if (providerId === "cloudflare-workers-ai") return "workers-ai";
	return ENABLED_BACKENDS.find((backend) => backend === providerId);
}

function filterStringHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers || {})) {
		if (typeof value === "string" && value.trim()) {
			resolved[key] = value;
		}
	}
	return resolved;
}

function normalizeHeaders(headers: Record<string, unknown> | undefined, backend: Backend): Record<string, string> {
	const resolved = filterStringHeaders(headers);

	if (backend === "anthropic") {
		const mergedValues = new Set(
			(resolved["anthropic-beta"] || "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		);
		for (const beta of ANTHROPIC_BETAS) mergedValues.add(beta);
		resolved["anthropic-beta"] = Array.from(mergedValues).join(",");
	}

	return resolved;
}

function resolveRouteConfig(raw: GatewayWellKnownResponse | undefined, backend: Backend): GatewayRouteConfig | undefined {
	const providers = raw?.config?.provider;
	const providerConfig = backend === "workers-ai"
		? providers?.["workers-ai"] || providers?.["cloudflare-workers-ai"]
		: providers?.[backend];
	const options = providerConfig?.options;
	const baseUrl = options?.baseURL || options?.baseUrl;
	if (!baseUrl) return undefined;

	return {
		baseUrl,
		headers: normalizeHeaders(options?.headers, backend),
		models: providerConfig?.models || {},
	};
}

function resolveGatewayConfig(raw: GatewayWellKnownResponse | undefined): ResolvedGatewayConfig {
	const enabled = new Set(
		(raw?.config?.enabled_providers || [])
			.map(mapProviderId)
			.filter((backend): backend is Backend => Boolean(backend)),
	);
	const routes: Partial<Record<Backend, GatewayRouteConfig>> = {};
	const enabledBackends: Backend[] = [];

	for (const backend of ENABLED_BACKENDS) {
		if (!enabled.has(backend)) continue;
		const route = resolveRouteConfig(raw, backend);
		if (!route) continue;
		routes[backend] = route;
		enabledBackends.push(backend);
	}

	return {
		origin: GATEWAY_ORIGIN,
		authEnv: raw?.auth?.env || "TOKEN",
		authCommand: raw?.auth?.command,
		enabledBackends,
		routes,
	};
}

// With no reachable (or authenticated) gateway config there are no routes and
// no models; the catalog stays empty until /login succeeds.
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

async function mergeRemoteConfig(wellKnown: GatewayWellKnownResponse, token?: string): Promise<GatewayWellKnownResponse> {
	const remoteUrl = wellKnown.remote_config?.url?.trim();
	if (!remoteUrl || !token) return wellKnown;
	if (!isAllowedGatewayOrigin(remoteUrl)) {
		throw new Error(`Refusing remote config from untrusted origin: ${remoteUrl}`);
	}

	const headers = applyGatewayToken(
		filterStringHeaders(wellKnown.remote_config?.headers),
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
