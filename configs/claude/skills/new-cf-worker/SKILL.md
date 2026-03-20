---
name: new-cf-worker
description: Create a new Cloudflare Workers project with modern tooling. Use when the user wants to start a new Cloudflare Worker, create a Workers project, or scaffold a CF worker.
---

# Create New Cloudflare Workers Project

## Instructions

When creating a new Cloudflare Workers project, follow these steps:

### 1. Get project name

Use any provided arguments as the project name, otherwise ask the user.

### 2. Create project structure

```bash
mkdir -p <project-name>/src
cd <project-name>
npm init -y
```

### 3. Update package.json

```json
{
  "name": "<project-name>",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "types": "wrangler types",
    "typecheck": "npm run types && tsgo --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "wrangler": "latest",
    "@typescript/native-preview": "latest"
  }
}
```

### 4. Create wrangler.jsonc

**IMPORTANT**: Use today's actual date for `compatibility_date` in YYYY-MM-DD format.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "<project-name>",
  "main": "src/index.ts",
  "compatibility_date": "<TODAY'S DATE>",
  "observability": {
    "logs": {
      "enabled": true
    },
    "traces": {
      "enabled": true
    }
  }
}
```

### 5. Create tsconfig.json

Configure for wrangler types (not @cloudflare/workers-types):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["./worker-configuration.d.ts"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 6. Create src/index.ts

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Hello from Cloudflare Workers!", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

### 7. Create .gitignore

```
node_modules/
.wrangler/
.env
dist/
*.log
worker-configuration.d.ts
```

### 8. Create .env for local secrets

```
# Local development secrets (not committed to git)
# MY_SECRET=your_secret_here
```

Wrangler automatically loads `.env` for local development. Add secrets here that your worker needs.

### 9. Create .mcp.json for Cloudflare documentation access

This gives Claude access to the Cloudflare documentation MCP server:

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp"
    }
  }
}
```

### 10. Install and verify

```bash
npm install
npm run types      # Generates worker-configuration.d.ts with Env type
npm run typecheck  # Verify types pass
```

Fix any type errors before finishing.

## Key Points

- **wrangler types**: Generates `worker-configuration.d.ts` with `Env` type from wrangler.jsonc bindings
- **tsgo**: Fast TypeScript type checker (faster than tsc)
- **compatibility_date**: Always use today's date for new projects
- **.mcp.json**: Connects Claude to Cloudflare documentation for contextual help
- **.env**: Local secrets for development (automatically loaded by wrangler)

## Node.js Compatibility

Only add `nodejs_compat` if the project needs Node.js APIs (adds slight overhead). When needed:

1. Add to wrangler.jsonc:
```jsonc
{
  "compatibility_flags": ["nodejs_compat"]
}
```

2. Add types to package.json devDependencies:
```json
{
  "devDependencies": {
    "@types/node": "latest"
  }
}
```

## Adding Bindings

Wrangler supports automatic provisioning (beta) - just add the binding name without IDs:

```jsonc
{
  "kv_namespaces": [{ "binding": "MY_KV" }],
  "d1_databases": [{ "binding": "DB" }],
  "r2_buckets": [{ "binding": "BUCKET" }]
}
```

Then run `npm run types` to regenerate the Env type.

When you deploy with `npm run deploy`, Wrangler automatically:
- Creates the resources on Cloudflare's network
- Writes the IDs back to your `wrangler.jsonc`

For local dev, resources are created automatically and persist between runs.

## After Setup

1. `npm run dev` - Start local development
2. `npm run deploy` - Deploy to Cloudflare
3. The `.mcp.json` file gives Claude access to Cloudflare docs - restart Claude Code to activate
4. Visit https://developers.cloudflare.com/workers/ for documentation
