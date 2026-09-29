import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	anthropicMessagesApi,
	type Api,
	type ApiKeyAuth,
	type AuthContext,
	createProvider,
	type Credential,
	type Model,
	openAIResponsesApi,
	type Provider,
} from "@earendil-works/pi-ai/compat";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runGatewayAuthCommand } from "./auth.ts";
import { getGatewayTokenExpiry } from "./wellknown.ts";

const FABLE_PROVIDER_ID = "fable.opencode.cloudflare.dev";
const FABLE_PROVIDER_NAME = "OpenCode Fable";
const FABLE_ORIGIN = "https://fable.opencode.cloudflare.dev";
const FABLE_WELL_KNOWN_URL = `${FABLE_ORIGIN}/.well-known/opencode`;
const FABLE_API_ORIGIN = "https://fable-gateway.opencode.cloudflare.dev";
const FABLE_TOKEN_ENV_OVERRIDE = "FABLE_OPENCODE_CLOUDFLARE_TOKEN";
const OPENCODE_AUTH_PATH_ENV = "OPENCODE_AUTH_PATH";

const FABLE_ROUTES = [
	{
		remoteProviderId: "anthropic-fable",
		backend: "anthropic",
		api: "anthropic-messages",
		fallbackBaseUrl: `${FABLE_API_ORIGIN}/anthropic`,
	},
	{
		remoteProviderId: "openai-special",
		backend: "openai",
		api: "openai-responses",
		fallbackBaseUrl: `${FABLE_API_ORIGIN}/openai`,
	},
] as const;

type FableRoute = (typeof FABLE_ROUTES)[number];
type JsonObject = Record<string, unknown>;

interface FableWellKnownConfig {
	readonly authCommand: string | string[] | undefined;
	readonly authEnv: string;
	readonly remoteConfigUrl: string;
	readonly remoteHeaders: Readonly<Record<string, string>>;
}

interface ResolvedFableToken {
	readonly token: string;
	readonly source: string;
}

const FALLBACK_MODELS: readonly Model<Api>[] = [
	{
		id: "claude-fable-5",
		name: "Claude Fable 5",
		api: "anthropic-messages",
		provider: FABLE_PROVIDER_ID,
		baseUrl: `${FABLE_API_ORIGIN}/anthropic`,
		reasoning: true,
		thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
		input: ["text", "image"],
		cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
		contextWindow: 1_000_000,
		maxTokens: 128_000,
		compat: { forceAdaptiveThinking: true, supportsStrictTools: true },
	},
	{
		id: "claude-fable-5-1",
		name: "Claude Fable 5.1",
		api: "anthropic-messages",
		provider: FABLE_PROVIDER_ID,
		baseUrl: `${FABLE_API_ORIGIN}/anthropic`,
		reasoning: true,
		thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
		input: ["text", "image"],
		cost: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
		contextWindow: 1_000_000,
		maxTokens: 128_000,
		compat: { forceAdaptiveThinking: true, supportsStrictTools: true },
	},
	{
		id: "gpt-6-astra",
		name: "GPT-6 Astra",
		api: "openai-responses",
		provider: FABLE_PROVIDER_ID,
		baseUrl: `${FABLE_API_ORIGIN}/openai`,
		reasoning: true,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		},
		input: ["text", "image"],
		cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
		contextWindow: 1_050_000,
		maxTokens: 128_000,
		compat: {
			supportsStrictMode: true,
			supportsOpenAIGrammarTools: true,
			supportsAdditionalTools: true,
			supportsToolSearch: true,
		},
	},
];

function asObject(value: unknown): JsonObject | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	// SAFETY: The runtime checks above establish a non-null, non-array object. Property values remain unknown.
	return value as JsonObject;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const parsed = nonEmptyString(entry);
		return parsed === undefined ? [] : [parsed];
	});
}

function stringRecord(value: unknown): Record<string, string> {
	const object = asObject(value);
	if (!object) return {};
	const entries: Array<[string, string]> = [];
	for (const [key, entry] of Object.entries(object)) {
		const parsed = nonEmptyString(entry);
		if (parsed !== undefined) entries.push([key, parsed]);
	}
	return Object.fromEntries(entries);
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
	const existing = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
	if (existing !== undefined) delete headers[existing];
	headers[name] = value;
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
	return Object.keys(headers).some((entry) => entry.toLowerCase() === name.toLowerCase());
}

function isAllowedUrl(value: string, expectedOrigin: string): boolean {
	try {
		return new URL(value).origin === expectedOrigin;
	} catch {
		return false;
	}
}

function parseAuthCommand(value: unknown): string | string[] | undefined {
	const single = nonEmptyString(value);
	if (single !== undefined) return single;
	const command = stringArray(value);
	return command.length > 0 ? command : undefined;
}

function parseWellKnown(value: unknown): FableWellKnownConfig {
	const root = asObject(value);
	const auth = asObject(root?.auth);
	const remote = asObject(root?.remote_config);
	const remoteConfigUrl = nonEmptyString(remote?.url);
	if (!remoteConfigUrl || !isAllowedUrl(remoteConfigUrl, FABLE_ORIGIN)) {
		throw new Error(`Refusing untrusted or missing Fable remote config URL from ${FABLE_WELL_KNOWN_URL}`);
	}
	return {
		authCommand: parseAuthCommand(auth?.command),
		authEnv: nonEmptyString(auth?.env) ?? "TOKEN",
		remoteConfigUrl,
		remoteHeaders: stringRecord(remote?.headers),
	};
}

async function fetchJson(url: string, headers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<unknown> {
	const response = await fetch(url, {
		method: "GET",
		headers: { Accept: "application/json", ...headers },
		signal,
	});
	if (!response.ok) {
		throw new Error(`Fable gateway request failed: ${response.status} ${response.statusText}`);
	}
	return response.json();
}

async function getFableWellKnown(signal?: AbortSignal): Promise<FableWellKnownConfig> {
	return parseWellKnown(await fetchJson(FABLE_WELL_KNOWN_URL, {}, signal));
}

function gatewayHeaders(config: FableWellKnownConfig, token: string): Record<string, string> {
	const headers: Record<string, string> = {};
	const placeholder = `{env:${config.authEnv}}`;
	for (const [name, value] of Object.entries(config.remoteHeaders)) {
		setHeader(headers, name, value.split(placeholder).join(token));
	}
	if (!hasHeader(headers, "cf-access-token")) setHeader(headers, "cf-access-token", token);
	if (!hasHeader(headers, "X-Requested-With")) setHeader(headers, "X-Requested-With", "xmlhttprequest");
	return headers;
}

function isCurrentToken(token: string | undefined): token is string {
	if (!token) return false;
	const expiresAt = getGatewayTokenExpiry(token);
	return expiresAt === undefined || expiresAt > Date.now();
}

function opencodeAuthPath(): string {
	const override = process.env[OPENCODE_AUTH_PATH_ENV]?.trim();
	if (override) return override;
	const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "opencode", "auth.json");
}

async function readOpenCodeFableToken(): Promise<string | undefined> {
	try {
		const raw: unknown = JSON.parse(await readFile(opencodeAuthPath(), "utf8"));
		const credentials = asObject(raw);
		const fable = asObject(credentials?.[FABLE_ORIGIN]);
		const token = nonEmptyString(fable?.token);
		return isCurrentToken(token) ? token : undefined;
	} catch {
		return undefined;
	}
}

async function resolveAmbientToken(): Promise<ResolvedFableToken | undefined> {
	const fromEnvironment = process.env[FABLE_TOKEN_ENV_OVERRIDE]?.trim();
	if (isCurrentToken(fromEnvironment)) {
		return { token: fromEnvironment, source: FABLE_TOKEN_ENV_OVERRIDE };
	}
	const fromOpenCode = await readOpenCodeFableToken();
	return fromOpenCode ? { token: fromOpenCode, source: "OpenCode auth store" } : undefined;
}

async function resolveRequestToken(
	ctx: AuthContext,
	storedToken: string | undefined,
): Promise<ResolvedFableToken | undefined> {
	const fromEnvironment = await ctx.env(FABLE_TOKEN_ENV_OVERRIDE);
	if (isCurrentToken(fromEnvironment)) {
		return { token: fromEnvironment, source: FABLE_TOKEN_ENV_OVERRIDE };
	}
	if (isCurrentToken(storedToken)) {
		return { token: storedToken, source: "stored credential" };
	}
	const fromOpenCode = await readOpenCodeFableToken();
	return fromOpenCode ? { token: fromOpenCode, source: "OpenCode auth store" } : undefined;
}

function createFableAuth(): ApiKeyAuth {
	return {
		name: "OpenCode Fable Cloudflare Access",
		async login(interaction) {
			const wellKnown = await getFableWellKnown(interaction.signal);
			interaction.notify({
				type: "auth_url",
				url: FABLE_ORIGIN,
				instructions: "Complete the Cloudflare Access login in your browser.",
			});
			interaction.notify({ type: "progress", message: "Running the Fable gateway login command..." });
			const token = await runGatewayAuthCommand(wellKnown.authCommand, interaction.signal);
			if (!isCurrentToken(token)) throw new Error("The Fable gateway returned an expired token.");
			return { type: "api_key", key: token };
		},
		async check({ ctx, credential }) {
			const resolved = await resolveRequestToken(ctx, credential?.key);
			return resolved ? { type: "api_key", source: resolved.source } : undefined;
		},
		async resolve({ ctx, credential }) {
			const resolved = await resolveRequestToken(ctx, credential?.key);
			if (!resolved) return undefined;
			return {
				auth: {
					apiKey: resolved.token,
					headers: {
						"cf-access-token": resolved.token,
						"X-Requested-With": "xmlhttprequest",
					},
				},
				source: resolved.source,
			};
		},
	};
}

function findBundledModel(backend: FableRoute["backend"], id: string): Model<Api> | undefined {
	if (backend === "anthropic") return getBuiltinModels("anthropic").find((model) => model.id === id);
	return getBuiltinModels("openai").find((model) => model.id === id);
}

function gatewayCompat(route: FableRoute, model: Model<Api> | undefined): Model<Api>["compat"] {
	const compat: Record<string, unknown> = { ...model?.compat };
	if (route.backend === "anthropic") {
		delete compat.supportsMidConvoEffort;
		compat.forceAdaptiveThinking = true;
		compat.supportsStrictTools = true;
	} else {
		delete compat.supportsExplicitPromptCacheMode;
		compat.supportsStrictMode = true;
		compat.supportsOpenAIGrammarTools = true;
		compat.supportsAdditionalTools = true;
		compat.supportsToolSearch = true;
	}
	// SAFETY: The copied and assigned properties are members of pi-ai's API compatibility unions.
	return compat as Model<Api>["compat"];
}

function parseInput(config: JsonObject, bundled: Model<Api> | undefined): ("text" | "image")[] {
	const modalities = asObject(config.modalities);
	const input: ("text" | "image")[] = [];
	for (const value of stringArray(modalities?.input)) {
		if ((value === "text" || value === "image") && !input.includes(value)) input.push(value);
	}
	if (input.length > 0) return input;
	if (config.attachment === true) return ["text", "image"];
	return bundled?.input.length ? [...bundled.input] : ["text"];
}

function modelFromRemote(
	route: FableRoute,
	routeBaseUrl: string,
	catalogId: string,
	value: unknown,
): Model<Api> | undefined {
	const config = asObject(value);
	if (!config) return undefined;
	const id = nonEmptyString(config.id) ?? catalogId;
	const bundled = findBundledModel(route.backend, id) ?? FALLBACK_MODELS.find((model) => model.id === id);
	const limit = asObject(config.limit);
	const cost = asObject(config.cost);
	const provider = asObject(config.provider);
	const configuredBaseUrl = nonEmptyString(provider?.api);
	if (configuredBaseUrl && !isAllowedUrl(configuredBaseUrl, FABLE_API_ORIGIN)) {
		throw new Error(`Refusing untrusted Fable model route for ${id}`);
	}
	return {
		id,
		name: nonEmptyString(config.name) ?? bundled?.name ?? id,
		api: route.api,
		provider: FABLE_PROVIDER_ID,
		baseUrl: configuredBaseUrl ?? routeBaseUrl,
		reasoning: typeof config.reasoning === "boolean" ? config.reasoning : (bundled?.reasoning ?? true),
		thinkingLevelMap: bundled?.thinkingLevelMap,
		input: parseInput(config, bundled),
		cost: {
			input: finiteNumber(cost?.input) ?? bundled?.cost.input ?? 0,
			output: finiteNumber(cost?.output) ?? bundled?.cost.output ?? 0,
			cacheRead: finiteNumber(cost?.cache_read) ?? bundled?.cost.cacheRead ?? 0,
			cacheWrite: finiteNumber(cost?.cache_write) ?? bundled?.cost.cacheWrite ?? 0,
		},
		contextWindow: finiteNumber(limit?.context) ?? bundled?.contextWindow ?? 128_000,
		maxTokens: finiteNumber(limit?.output) ?? bundled?.maxTokens ?? 16_384,
		compat: gatewayCompat(route, bundled),
	};
}

function parseFableModels(value: unknown): Model<Api>[] {
	const root = asObject(value);
	const enabled = new Set(stringArray(root?.enabled_providers));
	const providers = asObject(root?.provider);
	const models = new Map<string, Model<Api>>();

	for (const route of FABLE_ROUTES) {
		if (!enabled.has(route.remoteProviderId)) continue;
		const provider = asObject(providers?.[route.remoteProviderId]);
		const options = asObject(provider?.options);
		const routeBaseUrl = nonEmptyString(options?.baseURL) ?? nonEmptyString(options?.baseUrl) ?? route.fallbackBaseUrl;
		if (!isAllowedUrl(routeBaseUrl, FABLE_API_ORIGIN)) {
			throw new Error(`Refusing untrusted Fable API route for ${route.remoteProviderId}`);
		}
		const configuredModels = asObject(provider?.models);
		const whitelistValues = stringArray(provider?.whitelist);
		const whitelist = whitelistValues.length > 0 ? new Set(whitelistValues) : undefined;
		for (const [catalogId, rawModel] of Object.entries(configuredModels ?? {})) {
			const parsed = modelFromRemote(route, routeBaseUrl, catalogId, rawModel);
			if (!parsed || (whitelist && !whitelist.has(catalogId) && !whitelist.has(parsed.id))) continue;
			models.set(parsed.id, parsed);
		}
	}

	if (models.size === 0) throw new Error("The Fable gateway catalog contained no supported models.");
	return [...models.values()];
}

async function fetchFableModels(token: string, signal?: AbortSignal): Promise<Model<Api>[]> {
	const wellKnown = await getFableWellKnown(signal);
	const config = await fetchJson(wellKnown.remoteConfigUrl, gatewayHeaders(wellKnown, token), signal);
	return parseFableModels(config);
}

async function tokenFromRefreshCredential(credential: Credential | undefined): Promise<string | undefined> {
	const stored = credential?.type === "api_key" ? credential.key : undefined;
	if (isCurrentToken(stored)) return stored;
	return (await resolveAmbientToken())?.token;
}

function createFableProvider(): Provider {
	return createProvider<Api>({
		id: FABLE_PROVIDER_ID,
		name: FABLE_PROVIDER_NAME,
		baseUrl: FABLE_ORIGIN,
		auth: { apiKey: createFableAuth() },
		models: FALLBACK_MODELS,
		fetchModels: async ({ credential, signal }) => {
			const token = await tokenFromRefreshCredential(credential);
			if (!token) {
				throw new Error(
					`No Fable gateway token. Run \`opencode auth login ${FABLE_ORIGIN}\` or /login ${FABLE_PROVIDER_ID}.`,
				);
			}
			return fetchFableModels(token, signal);
		},
		api: {
			"anthropic-messages": anthropicMessagesApi(),
			"openai-responses": openAIResponsesApi(),
		},
	});
}

/** Register the authenticated Fable and Astra gateway as a separate Pi provider. */
export function registerFableProvider(pi: ExtensionAPI): void {
	pi.registerProvider(createFableProvider());
	pi.registerCommand("opencode-fable-refresh", {
		description: "Refresh the OpenCode Fable model catalog",
		handler: async (_args, ctx) => {
			const result = await ctx.modelRegistry.refresh({ providers: [FABLE_PROVIDER_ID], force: true });
			const error = result.errors.get(FABLE_PROVIDER_ID);
			if (error) {
				ctx.ui.notify(`Fable catalog refresh failed: ${error.message}`, "error");
				return;
			}
			const count = ctx.modelRegistry.getProvider(FABLE_PROVIDER_ID)?.getModels().length ?? 0;
			ctx.ui.notify(`Refreshed ${FABLE_PROVIDER_NAME}: ${count} models`, "info");
		},
	});
}
