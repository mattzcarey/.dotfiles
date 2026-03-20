---
name: codex-review
description: Send the current plan to OpenCode CLI with GPT-5.3-Codex for iterative review. Claude and OpenCode go back-and-forth until the plan is approved.
user_invocable: true
---

# OpenCode Plan Review (Iterative)

Send the current implementation plan to OpenCode (using GPT-5.3-Codex) for review. Claude revises the plan based on feedback and re-submits until approved. Max 5 rounds.

---

## When to Invoke

- When the user runs `/codex-review` during or after plan mode
- When the user wants a second opinion on a plan from a different model

## Agent Instructions

When invoked, perform the following iterative review loop:

### Step 1: Generate Session ID

Generate a unique ID to avoid conflicts with other concurrent Claude Code sessions:

```bash
REVIEW_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | head -c 8)
```

Use this for all temp file paths: `/tmp/claude-plan-${REVIEW_ID}.md` and `/tmp/opencode-review-${REVIEW_ID}.md`.

### Step 2: Capture the Plan and Repo Context

Write the current plan to the session-scoped temporary file. The plan is whatever implementation plan exists in the current conversation context (from plan mode, or a plan discussed in chat).

1. **Detect the repo context** — run `git remote get-url origin 2>/dev/null` to get the repo URL. If working in a subdirectory, note the relative path.
2. **Write the plan file** to `/tmp/claude-plan-${REVIEW_ID}.md` with repo context at the top:

```markdown
## Repository Context

- **Repo:** https://github.com/org/repo (or local path if no remote)
- **Working directory:** /path/to/current/dir
- **Branch:** current-branch-name

---

## Implementation Plan

[The actual plan content here]
```

3. If there is no plan in the current context, ask the user what they want reviewed

### Step 3: Initial Review (Round 1)

Run OpenCode CLI in non-interactive mode to review the plan:

```bash
opencode run \
  -m openai/gpt-5.3-codex \
  "Review the implementation plan in /tmp/claude-plan-${REVIEW_ID}.md.

The plan includes repository context at the top — use this to understand the codebase. You can browse the repo for additional context if needed.

Focus on:
1. Correctness - Will this plan achieve the stated goals?
2. Risks - What could go wrong? Edge cases? Data loss?
3. Missing steps - Is anything forgotten?
4. Alternatives - Is there a simpler or better approach?
5. Security - Any security concerns?
6. Codebase fit - Does this align with existing patterns in the repo?

Be specific and actionable. If the plan is solid and ready to implement, end your review with exactly: VERDICT: APPROVED

If changes are needed, end with exactly: VERDICT: REVISE" > /tmp/opencode-review-${REVIEW_ID}.md 2>&1
```

**Capture the OpenCode session ID** from the output. OpenCode displays session info that can be used with `--session` to continue. Store this as `OPENCODE_SESSION_ID`.

**Notes:**
- Use `-m openai/gpt-5.3-codex` as the default model. If the user specifies a different model (e.g., `/codex-review anthropic/claude-sonnet-4`), use that instead.
- OpenCode has read access to the filesystem by default for reading context.
- Redirect stdout to capture the output to a file for reliable reading.

### Step 4: Read Review & Check Verdict

1. Read `/tmp/opencode-review-${REVIEW_ID}.md`
2. Present OpenCode's review to the user:

```
## OpenCode Review — Round N (model: openai/gpt-5.3-codex)

[OpenCode's feedback here]
```

3. Check the verdict:
   - If **VERDICT: APPROVED** → go to Step 7 (Done)
   - If **VERDICT: REVISE** → go to Step 5 (Revise & Re-submit)
   - If no clear verdict but feedback is all positive / no actionable items → treat as approved
   - If max rounds (5) reached → go to Step 7 with a note that max rounds hit

### Step 5: Revise the Plan

Based on OpenCode's feedback:

1. **Revise the plan** — address each issue OpenCode raised. Update the plan content in the conversation context and rewrite `/tmp/claude-plan-${REVIEW_ID}.md` with the revised version.
2. **Briefly summarize** what you changed for the user:

```
### Revisions (Round N)
- [What was changed and why, one bullet per issue addressed]
```

3. Inform the user what's happening: "Sending revised plan back to OpenCode for re-review..."

### Step 6: Re-submit to OpenCode (Rounds 2-5)

Continue the existing OpenCode session so it has full context of the prior review:

```bash
opencode run \
  -m openai/gpt-5.3-codex \
  --session ${OPENCODE_SESSION_ID} \
  "I've revised the plan based on your feedback. The updated plan is in /tmp/claude-plan-${REVIEW_ID}.md.

Here's what I changed:
[List the specific changes made]

Please re-review. If the plan is now solid and ready to implement, end with: VERDICT: APPROVED
If more changes are needed, end with: VERDICT: REVISE" > /tmp/opencode-review-${REVIEW_ID}.md 2>&1
```

**Note:** If session continuation fails (e.g., session expired), fall back to a fresh `opencode run` call with context about the prior rounds included in the prompt.

Then go back to **Step 4** (Read Review & Check Verdict).

### Step 7: Present Final Result

Once approved (or max rounds reached):

```
## OpenCode Review — Final (model: openai/gpt-5.3-codex)

**Status:** ✅ Approved after N round(s)

[Final feedback / approval message]

---
**The plan has been reviewed and approved. Ready for your approval to implement.**
```

If max rounds were reached without approval:

```
## OpenCode Review — Final (model: openai/gpt-5.3-codex)

**Status:** ⚠️ Max rounds (5) reached — not fully approved

**Remaining concerns:**
[List unresolved issues from last review]

---
**OpenCode still has concerns. Review the remaining items and decide whether to proceed or continue refining.**
```

### Step 8: Cleanup

Remove the session-scoped temporary files:
```bash
rm -f /tmp/claude-plan-${REVIEW_ID}.md /tmp/opencode-review-${REVIEW_ID}.md
```

## Loop Summary

```
Round 1: Claude sends plan → OpenCode reviews → REVISE?
Round 2: Claude revises → OpenCode re-reviews (session continue) → REVISE?
Round 3: Claude revises → OpenCode re-reviews (session continue) → APPROVED ✅
```

Max 5 rounds. Each round preserves OpenCode's conversation context via session continuation.

## Rules

- Claude **actively revises the plan** based on OpenCode feedback between rounds — this is NOT just passing messages, Claude should make real improvements
- **Always include repo context** — detect the git remote URL and working directory so OpenCode can browse the codebase for context
- Default model is `openai/gpt-5.3-codex`. Accept model override from the user's arguments (e.g., `/codex-review anthropic/claude-sonnet-4`)
- Max 5 review rounds to prevent infinite loops
- Show the user each round's feedback and revisions so they can follow along
- If OpenCode CLI is not installed or fails, inform the user and suggest installing from https://opencode.ai or running `curl -fsSL https://opencode.ai/install | bash`
- If a revision contradicts the user's explicit requirements, skip that revision and note it for the user
