import { spawn } from "node:child_process";
import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { OAuthCredential, OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { DEFAULT_TOKEN_EXPIRY_MS, GATEWAY_ORIGIN, PROVIDER_ID, WELL_KNOWN_URL } from "./constants.ts";
import {
	getGatewayConfig,
	getGatewayTokenExpiry,
	isAllowedGatewayOrigin,
	resolvePreferredToken,
} from "./wellknown.ts";

export function createGatewayCredentials(token: string, extra?: Record<string, unknown>): OAuthCredentials {
	const expiresAt = getGatewayTokenExpiry(token) ?? Date.now() + DEFAULT_TOKEN_EXPIRY_MS;
	return {
		refresh: "",
		access: token,
		expires: expiresAt,
		...extra,
	};
}

export function resolveGatewayToken(apiKey?: string): string | undefined {
	const preferred = resolvePreferredToken(apiKey);
	if (preferred) return preferred;
	const stored = getPiStoredGatewayCredential();
	if (stored?.access && stored.expires > Date.now()) return stored.access;
	// Last resort: an expired stored token, so the gateway's 401 (rather than a
	// silent empty catalog) tells the user to /login again.
	return stored?.access;
}

export function getPiStoredGatewayCredential(): OAuthCredential | undefined {
	const credential = readStoredCredential(PROVIDER_ID);
	return credential?.type === "oauth" ? credential : undefined;
}

export async function loginOpencodeCloudflare(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	const gateway = await getGatewayConfig({ forceReload: true, fallbackToDefault: false });
	if (!isAllowedGatewayOrigin(gateway.origin)) {
		throw new Error(`Refusing login for untrusted gateway origin: ${gateway.origin}`);
	}

	callbacks.onAuth({
		url: GATEWAY_ORIGIN,
		instructions: "Complete the Cloudflare Access login in your browser. This runs the gateway-provided login command locally.",
	});
	callbacks.onProgress?.("Running Cloudflare Access login command...");

	const token = await runGatewayAuthCommand(gateway.authCommand, callbacks.signal);
	callbacks.onProgress?.("Cloudflare Access token acquired.");
	return createGatewayCredentials(token, { source: "pi-login" });
}

export async function refreshOpencodeCloudflare(_credentials: OAuthCredentials): Promise<OAuthCredentials> {
	throw new Error(`The OpenCode Cloudflare token has expired. Run /login ${PROVIDER_ID}.`);
}

export async function runGatewayAuthCommand(
	command: string | string[] | undefined,
	signal?: AbortSignal,
): Promise<string> {
	if (!command || (Array.isArray(command) && command.length === 0)) {
		throw new Error(`Gateway auth command missing from ${WELL_KNOWN_URL}`);
	}

	const child = Array.isArray(command)
		? spawn(command[0]!, command.slice(1), {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			env: process.env,
		})
		: spawn(command, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: true,
			env: process.env,
		});

	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	const timeout = setTimeout(() => {
		child.kill("SIGTERM");
	}, 5 * 60 * 1000);

	const abort = () => {
		child.kill("SIGTERM");
	};
	signal?.addEventListener("abort", abort, { once: true });

	if (child.stdout) {
		child.stdout.on("data", (chunk: Buffer | string) => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
	}
	if (child.stderr) {
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
	}

	try {
		const exitCode = await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => resolve(code ?? 0));
		});

		const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
		const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

		if (signal?.aborted) {
			throw new Error("Login cancelled");
		}
		if (exitCode !== 0) {
			throw new Error(stderr || `Gateway auth command exited with status ${exitCode}`);
		}
		if (!stdout) {
			throw new Error("Gateway auth command did not emit a token on stdout.");
		}
		return stdout;
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abort);
	}
}
