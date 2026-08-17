import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { resolveGatewayToken } from "./auth.ts";
import { DEFAULT_ROUTE_URLS, type Backend } from "./constants.ts";
import { getDefaultGatewayConfig, getGatewayConfig, stripRoutePrefix, type GatewayModelConfig } from "./wellknown.ts";

export interface RouteDescriptor {
	backend: Backend;
	api: Api;
	baseUrl: string;
	headers: Record<string, string>;
	requestModelId?: string;
	compat?: Model<Api>["compat"];
}

export interface CatalogData {
	models: ProviderModelConfig[];
	routes: Map<string, RouteDescriptor>;
	counts: Record<Backend, number>;
}

// Fallback for when the gateway's remote config is unreachable. Entries mirror
// the gateway's shape: unprefixed key, routable "workers-ai/..." id.
const DEFAULT_WORKERS_MODELS: Record<string, GatewayModelConfig> = {
	"@cf/deepseek-ai/deepseek-v4-flash": {
		id: "workers-ai/@cf/deepseek-ai/deepseek-v4-flash",
		name: "DeepSeek V4 Flash",
		reasoning: true,
		modalities: { input: ["text"], output: ["text"] },
		limit: { context: 393216, output: 32000 },
	},
	"@cf/deepseek-ai/deepseek-v4-pro": {
		id: "workers-ai/@cf/deepseek-ai/deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		reasoning: true,
		modalities: { input: ["text"], output: ["text"] },
		limit: { context: 1048560, output: 32000 },
	},
	"@cf/zai-org/glm-5.1": {
		id: "workers-ai/@cf/zai-org/glm-5.1",
		name: "GLM 5.1",
		reasoning: true,
		modalities: { input: ["text"], output: ["text"] },
		limit: { context: 200000, output: 32000 },
	},
	"@cf/zai-org/glm-5.2": {
		id: "workers-ai/@cf/zai-org/glm-5.2",
		name: "GLM 5.2",
		reasoning: true,
		modalities: { input: ["text"], output: ["text"] },
		limit: { context: 262144, output: 32000 },
	},
};

let activeCatalog: CatalogData = buildCatalogFromGateway(getDefaultGatewayConfig());

export function getCatalog(): CatalogData {
	return activeCatalog;
}

export async function refreshCatalog(forceReload: boolean = false): Promise<CatalogData> {
	const gateway = await getGatewayConfig({
		forceReload,
		fallbackToDefault: true,
		token: resolveGatewayToken(),
	});
	activeCatalog = buildCatalogFromGateway(gateway);
	return activeCatalog;
}

export function summarizeCatalog(catalog: CatalogData = activeCatalog): string {
	return `anthropic=${catalog.counts.anthropic}, openai=${catalog.counts.openai}, xai=${catalog.counts.xai}, workers-ai=${catalog.counts["workers-ai"]}`;
}

function toProviderModelConfig(model: Model<Api>): ProviderModelConfig {
	return {
		id: model.id,
		name: model.name,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	};
}

function applyGatewayModelLimit(model: Model<Api>, gatewayModels: Record<string, GatewayModelConfig>, backend: Backend): Model<Api> {
	const gatewayConfig = gatewayModels[model.id] || gatewayModels[`${backend}/${model.id}`] || gatewayModels[`anthropic/${model.id}`];
	if (!gatewayConfig?.limit) return model;
	return {
		...model,
		contextWindow: gatewayConfig.limit.context || model.contextWindow,
		maxTokens: gatewayConfig.limit.output || model.maxTokens,
	};
}

function buildBuiltInModels(backend: Exclude<Backend, "workers-ai">, gatewayModels: Record<string, GatewayModelConfig>): Model<Api>[] {
	const builtIns = getBuiltinModels(backend) as Model<Api>[];

	if ((backend === "openai" || backend === "xai") && Object.keys(gatewayModels).length > 0) {
		const allowlist = new Set(Object.keys(gatewayModels).map((id) => stripRoutePrefix(id, backend)));
		return builtIns.filter((model) => allowlist.has(model.id)).map((model) => applyGatewayModelLimit(model, gatewayModels, backend));
	}

	return builtIns.map((model) => applyGatewayModelLimit(model, gatewayModels, backend));
}

function buildWorkersModels(gatewayModels: Record<string, GatewayModelConfig>, baseUrl: string, headers: Record<string, string>) {
	const source = Object.keys(gatewayModels).length > 0 ? gatewayModels : DEFAULT_WORKERS_MODELS;
	const models: ProviderModelConfig[] = [];
	const routes = new Map<string, RouteDescriptor>();

	for (const [key, config] of Object.entries(source)) {
		// Keys are unprefixed ("@cf/...") with the routable id in config.id
		// ("workers-ai/@cf/..."); the /compat endpoint only accepts the prefixed form.
		const requestModelId = config.id || key;
		const shortId = stripRoutePrefix(key, "workers-ai");
		models.push({
			id: shortId,
			name: `${requestModelId} (${config.name || shortId})`,
			reasoning: config.reasoning !== false,
			input: config.modalities?.input || (config.attachment ? ["text", "image"] : ["text"]),
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: config.limit?.context || 128000,
			maxTokens: config.limit?.output || Number(config.options?.max_tokens) || 16384,
			compat: {
				supportsStore: false,
				supportsDeveloperRole: false,
				supportsReasoningEffort: false,
				maxTokensField: "max_tokens",
			},
		});
		routes.set(shortId, {
			backend: "workers-ai",
			api: "openai-completions",
			baseUrl,
			headers,
			requestModelId,
			compat: {
				supportsStore: false,
				supportsDeveloperRole: false,
				supportsReasoningEffort: false,
				maxTokensField: "max_tokens",
			},
		});
	}

	return { models, routes };
}

function buildCatalogFromGateway(gateway: Awaited<ReturnType<typeof getGatewayConfig>>): CatalogData {
	const models: ProviderModelConfig[] = [];
	const routes = new Map<string, RouteDescriptor>();
	const counts: Record<Backend, number> = {
		anthropic: 0,
		openai: 0,
		xai: 0,
		"workers-ai": 0,
	};

	for (const backend of gateway.enabledBackends) {
		const route = gateway.routes[backend];
		if (backend === "workers-ai") {
			const workers = buildWorkersModels(route.models, route.baseUrl || DEFAULT_ROUTE_URLS[backend], route.headers);
			models.push(...workers.models);
			for (const [modelId, descriptor] of workers.routes.entries()) {
				routes.set(modelId, descriptor);
			}
			counts[backend] = workers.models.length;
			continue;
		}

		const builtIns = buildBuiltInModels(backend, route.models);
		for (const model of builtIns) {
			models.push(toProviderModelConfig(model));
			routes.set(model.id, {
				backend,
				api: model.api,
				baseUrl: route.baseUrl,
				headers: route.headers,
				compat: model.compat,
			});
		}
		counts[backend] = builtIns.length;
	}

	return { models, routes, counts };
}
