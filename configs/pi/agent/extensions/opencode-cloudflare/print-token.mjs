#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GATEWAY_ORIGIN = "https://opencode.cloudflare.dev";
const WELL_KNOWN_URL = `${GATEWAY_ORIGIN}/.well-known/opencode`;
const PROVIDER_ID = "opencode.cloudflare.dev";
const TOKEN_ENV_OVERRIDE = "OPENCODE_CLOUDFLARE_TOKEN";
const AUTH_FILE_ENV = "OPENCODE_CLOUDFLARE_AUTH_FILE";

function readJson(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return undefined;
	}
}

function tokenExpiry(token) {
	const parts = token.split(".");
	if (parts.length < 2) return undefined;
	try {
		const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
		return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

function isUsable(token) {
	if (!token?.trim()) return false;
	const expires = tokenExpiry(token);
	return !expires || expires > Date.now();
}

function readPiToken() {
	const auth = readJson(path.join(os.homedir(), ".pi", "agent", "auth.json"));
	const access = auth?.[PROVIDER_ID]?.access;
	return typeof access === "string" ? access.trim() : undefined;
}

function listOpenCodeCandidates() {
	const candidates = new Set();
	if (process.env[AUTH_FILE_ENV]) candidates.add(path.resolve(process.env[AUTH_FILE_ENV]));
	if (process.env.XDG_DATA_HOME) candidates.add(path.join(process.env.XDG_DATA_HOME, "opencode", "auth.json"));
	candidates.add(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
	return [...candidates];
}

function readOpenCodeToken() {
	for (const authPath of listOpenCodeCandidates()) {
		if (!fs.existsSync(authPath)) continue;
		const auth = readJson(authPath);
		for (const key of [GATEWAY_ORIGIN, `${GATEWAY_ORIGIN}/`, WELL_KNOWN_URL]) {
			const token = auth?.[key]?.token;
			if (typeof token === "string" && token.trim()) return token.trim();
		}
	}
	return undefined;
}

const candidates = [
	process.env[TOKEN_ENV_OVERRIDE]?.trim(),
	readPiToken(),
	readOpenCodeToken(),
].filter(Boolean);

const token = candidates.find(isUsable) || candidates[0];
if (token) process.stdout.write(token);
