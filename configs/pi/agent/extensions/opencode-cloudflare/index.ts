import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loginOpencodeCloudflare, refreshOpencodeCloudflare, resolveGatewayToken } from "./auth.ts";
import { getCatalog, refreshCatalog, summarizeCatalog } from "./catalog.ts";
import { CUSTOM_API, GATEWAY_ORIGIN, PROVIDER_ID, PROVIDER_NAME } from "./constants.ts";
import { streamOpencodeCloudflare } from "./dispatch.ts";
import { clearGatewayConfigCache, getGatewayConfig } from "./wellknown.ts";

function isCommandAvailable(command: string): boolean {
	if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
	const result = spawnSync("/bin/sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], {
		stdio: "ignore",
	});
	return result.status === 0;
}

async function handleDoctor(ctx: ExtensionCommandContext): Promise<void> {
	clearGatewayConfigCache();
	const gateway = await getGatewayConfig({
		forceReload: true,
		fallbackToDefault: false,
		token: resolveGatewayToken(),
	});
	await refreshCatalog(true);

	const report = [
		`${PROVIDER_NAME} doctor`,
		`Gateway origin: ${gateway.origin}`,
		`Auth command: ${Array.isArray(gateway.authCommand) ? gateway.authCommand.join(" ") : gateway.authCommand || "missing"}`,
		`Enabled backends: ${gateway.enabledBackends.join(", ")}`,
		`cloudflared: ${isCommandAvailable("cloudflared") ? "found" : "missing"}`,
		`Catalog: ${summarizeCatalog(getCatalog())}`,
	].join("\n");

	ctx.ui.notify(report, "info");
}

export default async function (pi: ExtensionAPI) {
	const catalog = await refreshCatalog(true);

	pi.registerProvider(PROVIDER_ID, {
		baseUrl: GATEWAY_ORIGIN,
		api: CUSTOM_API,
		models: catalog.models,
		oauth: {
			name: PROVIDER_NAME,
			login: loginOpencodeCloudflare,
			refreshToken: refreshOpencodeCloudflare,
			getApiKey: (credentials) => String(credentials.access || ""),
		},
		streamSimple: streamOpencodeCloudflare,
	});

	pi.registerCommand("opencode-cf-doctor", {
		description: "Validate the OpenCode Cloudflare gateway configuration",
		handler: async (_args, ctx) => {
			await handleDoctor(ctx);
		},
	});
}
