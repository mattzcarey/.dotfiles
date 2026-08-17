// Pi's extension loader only exposes pi-ai through the compat entrypoint (it
// aliases the bare "@earendil-works/pi-ai" specifier to compat and supports no
// other subpaths besides /oauth and /providers/all), so the api factories must
// be imported from here rather than "@earendil-works/pi-ai/api/*.lazy".
import {
	anthropicMessagesApi,
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	openAICompletionsApi,
	openAIResponsesApi,
	type ProviderStreams,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai/compat";
import { getCatalog, refreshCatalog, type RouteDescriptor } from "./catalog.ts";
import { PROVIDER_ID, TOKEN_ENV_OVERRIDE } from "./constants.ts";
import { resolveGatewayToken } from "./auth.ts";
import { applyGatewayToken, getGatewayConfig } from "./wellknown.ts";

export function streamOpencodeCloudflare(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		try {
			const route = await resolveRoute(model);
			const token = resolveGatewayToken(options?.apiKey);
			if (!token) {
				throw new Error(
					`No token available for ${PROVIDER_ID}. Run /login ${PROVIDER_ID}, set ${TOKEN_ENV_OVERRIDE}, or run \`opencode auth login https://opencode.cloudflare.dev\`.`,
				);
			}

			const gateway = await getGatewayConfig({ fallbackToDefault: true, token });
			const gatewayRoute = gateway.routes[route.backend];
			const delegatedModel: Model<Api> = {
				...model,
				id: route.requestModelId || model.id,
				api: route.api,
				baseUrl: gatewayRoute?.baseUrl || route.baseUrl,
				headers: applyGatewayToken(gatewayRoute?.headers || route.headers, gateway.authEnv, token),
				compat: route.compat,
			};

			const innerStream = createDelegatedStream(delegatedModel, route, context, { ...options, apiKey: token });
			for await (const event of innerStream) {
				stream.push(normalizeEvent(event, model));
			}
			stream.end();
		} catch (error) {
			stream.push({
				type: "error",
				reason: "error",
				error: createErrorMessage(model, error),
			});
			stream.end();
		}
	})();

	return stream;
}

async function resolveRoute(model: Model<Api>): Promise<RouteDescriptor> {
	let route = getCatalog().routes.get(model.id);
	if (route) return route;
	const refreshed = await refreshCatalog(true);
	route = refreshed.routes.get(model.id);
	if (!route) {
		throw new Error(`Unknown ${PROVIDER_ID} model: ${model.id}`);
	}
	return route;
}

// Lazy API implementations: the underlying SDK loads on the first request.
const DELEGATED_APIS: Partial<Record<Api, ProviderStreams>> = {
	"anthropic-messages": anthropicMessagesApi(),
	"openai-responses": openAIResponsesApi(),
	"openai-completions": openAICompletionsApi(),
};

function createDelegatedStream(
	model: Model<Api>,
	route: RouteDescriptor,
	context: Context,
	options: SimpleStreamOptions,
): AssistantMessageEventStream {
	const api = DELEGATED_APIS[route.api];
	if (!api) {
		throw new Error(`Unsupported delegated API for ${PROVIDER_ID}: ${route.api}`);
	}
	// The gateway authenticates via the cf-access-token header alone, so the
	// anthropic route no longer needs the old github-copilot provider masquerade
	// (which forced Bearer auth); the default x-api-key client works fine.
	return api.streamSimple(model, context, options);
}

// Events from the delegated stream carry the backend's api/provider/model ids;
// rewrite them so the rest of pi sees the model the user actually selected.
function normalizeEvent(event: AssistantMessageEvent, visibleModel: Model<Api>): AssistantMessageEvent {
	switch (event.type) {
		case "done":
			return { ...event, message: normalizeAssistantMessage(event.message, visibleModel) };
		case "error":
			return { ...event, error: normalizeAssistantMessage(event.error, visibleModel) };
		default:
			return { ...event, partial: normalizeAssistantMessage(event.partial, visibleModel) };
	}
}

function normalizeAssistantMessage(message: AssistantMessage, visibleModel: Model<Api>): AssistantMessage {
	return {
		...message,
		api: visibleModel.api,
		provider: visibleModel.provider,
		model: visibleModel.id,
	};
}

function createErrorMessage(model: Model<Api>, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}
