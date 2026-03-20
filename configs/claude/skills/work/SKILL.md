---
name: work
description: Set up a git worktree for a repo in ~/Documents/Github, branch off origin/main, research context, then plan and implement together with the user.
user_invocable: true
argument_description: "<repo> <context description>"
---

# Work — Worktree + Research + Plan + Implement

This skill sets up an isolated worktree for a repository, researches the given context, and then collaborates with the user to plan and implement.

## Arguments

The first argument is the **repo name** (a directory under `/Users/matt/Documents/Github/`).
Everything after it is the **context** — a description of the work to be done.

Example: `/work agents add retry logic to the MCP client`

## Stage 1: Set up the worktree

1. **Parse arguments.** Extract the repo name and context string.
2. **Determine the branch prefix** from the context:
   - If the context clearly describes a bug fix → `fix/`
   - If it describes documentation work → `docs/`
   - If it describes cleanup or maintenance → `chore/`
   - Otherwise → `feat/`
3. **Slugify the context** into a branch-friendly name: lowercase, spaces to hyphens, strip special chars, truncate to ~50 chars. Example: "add retry logic to the MCP client" → `add-retry-logic-to-the-mcp-client`
4. **Derive names:**
   - Branch: `<prefix><slug>` (e.g. `feat/add-retry-logic-to-the-mcp-client`)
   - Worktree directory: `/Users/matt/Documents/Github/<repo>-<slug>` (e.g. `agents-add-retry-logic-to-the-mcp-client`)
5. **Fetch latest from remote:**
   ```bash
   cd /Users/matt/Documents/Github/<repo>
   git fetch origin
   ```
   If `origin` doesn't exist, try `upstream`. Use whichever remote has a `main` branch (check for `main` first, then `master`).
6. **Create the worktree:**
   ```bash
   git worktree add -b <branch> /Users/matt/Documents/Github/<worktree-dir> <remote>/main
   ```
7. **Confirm** by printing the worktree path and branch name.
8. **Update memory.** Add the new worktree to the Agents Repo Worktrees section (or equivalent) in `/Users/matt/.claude/projects/-Users-matt-Documents-Github/memory/MEMORY.md` so future conversations know about it. Also create/update the relevant memory file if the project context warrants it.

## Stage 2: Research

1. **cd into the new worktree directory.**
2. **Research the context** the user described. Use the Explore agent or direct Grep/Glob/Read to understand the relevant parts of the codebase. Look at:
   - Related files, modules, and tests
   - Recent git history on the relevant files
   - Any existing issues or TODOs related to the context
3. **Present findings** to the user as a concise summary:
   - What you found in the codebase related to the context
   - Key files and areas that will likely need changes
   - Any potential concerns or considerations

## Stage 3: Plan (collaborative)

1. **Ask the user what they'd like to do** based on your research. Do NOT proceed to implementation without user input.
2. Enter plan mode and collaborate with the user to define the approach.
3. The plan should cover:
   - What changes to make and where
   - Any new files needed
   - Testing approach
4. Get explicit user approval before moving to implementation.

## Stage 4: Implement

1. Execute the agreed plan.
2. Work within the worktree directory — never modify the original repo.
3. After implementation, run any relevant tests or checks.
4. Summarize what was done and what's next (e.g., "ready for PR", "needs manual testing").

## Important

- Each stage is **distinct**. Do NOT skip ahead. Complete research before asking the user to plan. Get plan approval before implementing.
- Always work in the **worktree**, never in the main repo directory.
- If the worktree directory already exists, warn the user and ask how to proceed rather than overwriting.
