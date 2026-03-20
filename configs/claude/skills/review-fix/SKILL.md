---
name: review-fix
description: Fetch PR/MR review comments (GitHub or GitLab), plan fixes, get Codex review, then implement, verify, commit and push.
user_invocable: true
argument_description: "[PR/MR number] — optional, auto-detects from current branch if omitted"
---

# Review Fix — Fetch Comments, Plan, Review, Implement, Ship

Fetches unresolved review comments from a GitHub PR or GitLab MR, builds a fix plan, sends it through Codex review, presents it to the user for approval, implements the fixes, verifies everything passes, and commits+pushes.

## Arguments

- Optional first argument: PR/MR number (e.g., `/review-fix 144`)
- If omitted, auto-detect from the current branch

## Stage 0: Detect Platform

Determine whether this is a GitHub or GitLab repo by inspecting the remote URL:

```bash
git remote get-url origin
```

- If the URL contains `github.com` → **GitHub mode** (use `gh` CLI)
- If the URL contains `gitlab` → **GitLab mode** (use `glab` CLI)
- If unclear, check for `.gitlab-ci.yml` (GitLab) or `.github/` directory (GitHub)

Set `PLATFORM=github` or `PLATFORM=gitlab` for the rest of the skill.

## Stage 1: Fetch Review Comments

### GitHub Mode

1. **Detect the PR.** If no number given:
   ```bash
   gh pr view --json number -q '.number'
   ```

2. **Fetch review comments:**
   ```bash
   gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews"
   gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments"
   ```

3. **Filter to human reviewer comments only:**
   - Exclude bot authors (usernames containing `bot`, `[bot]`, `github-actions`)
   - Focus on unresolved review threads
   - Extract: author, body, file path + line number (if inline), review state

### GitLab Mode

1. **Detect the MR.** If no number given:
   ```bash
   glab mr view --json iid -q 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['iid'])"
   ```
   Fallback: `glab mr list --source-branch=$(git branch --show-current)`

2. **Detect the project path** from the remote URL. URL-encode it (replace `/` with `%2F`).

3. **Fetch all notes and discussions:**
   ```bash
   glab api "projects/<encoded-path>/merge_requests/<MR_ID>/notes?per_page=100&sort=asc"
   glab api "projects/<encoded-path>/merge_requests/<MR_ID>/discussions?per_page=100"
   ```

4. **Filter to human reviewer comments only:**
   - Exclude `system: true` notes
   - Exclude bot authors (usernames containing `bot`, `gsa_`, `ci-`)
   - Focus on unresolved discussions where `resolved: false` or standalone notes
   - Extract: author, body, file path + line number (if inline), resolved status

### Present Summary (both platforms)

```
## <PR #N | MR !N> — Review Comments

Found <N> reviewer comments (<M> unresolved):

### From @<reviewer1>
1. [file:line] <summary of comment>
2. [general] <summary of comment>

### From @<reviewer2>
...
```

If there are no unresolved comments, inform the user and stop.

## Stage 2: Plan Fixes

1. **Read the relevant source files** mentioned in the comments. Also read surrounding context to understand the codebase patterns.

2. **Create a fix plan** addressing each reviewer comment. For each comment:
   - State the comment summary
   - Describe the proposed fix
   - Note the file(s) to change

3. **Present the plan:**
   ```
   ## Fix Plan

   ### 1. <Comment summary> (@reviewer)
   **Fix:** <what you'll do>
   **Files:** <file paths>

   ### 2. ...
   ```

## Stage 3: Codex Review

1. **Invoke the `/codex-review` skill** to send the fix plan through OpenCode/Codex for review.
2. Revise the plan based on Codex feedback (the codex-review skill handles the iteration loop).
3. Once Codex approves, proceed to Stage 4.

## Stage 4: User Approval

1. **Present the final reviewed plan** to the user with all revisions incorporated.
2. **Ask for explicit approval** before implementing:
   ```
   The plan has been reviewed by Codex and is ready for implementation.
   Shall I proceed with these changes?
   ```
3. **Do NOT proceed** without user approval. If the user wants changes, revise the plan and optionally re-run Codex review.

## Stage 5: Implement

1. **Make the changes** according to the approved plan.
2. Work through each fix systematically, one comment at a time.
3. After all changes are made, briefly summarize what was done.

## Stage 6: Verify

Run all verification scripts. Check `package.json` for available scripts and run whichever of these exist:

```bash
# Run each that exists in package.json scripts
npm run check 2>&1
npm run lint 2>&1
npm run format 2>&1
npm run build 2>&1
npm run test 2>&1
```

- If any script fails, fix the issue and re-run.
- Iterate until all checks pass.
- If a check doesn't exist in package.json, skip it silently.

## Stage 7: Commit & Push

1. **Stage all changed files** (only files you modified, not unrelated changes):
   ```bash
   git add <specific files>
   ```

2. **Create a single commit** with a message referencing the PR/MR:
   - GitHub: `fix: address PR #<number> review feedback`
   - GitLab: `fix: address MR !<number> review feedback`

   Body:
   ```
   - <brief summary of fix 1>
   - <brief summary of fix 2>
   - ...
   ```

3. **Push to the remote branch:**
   ```bash
   git push origin HEAD
   ```

4. **Confirm** by showing the push result and a link to the PR/MR.

## Rules

- **Always filter out bot comments** — only address human reviewer feedback
- **Never skip Stage 4** — user must approve before implementation
- **One commit** — all fixes go in a single commit, not one per comment
- **Don't over-fix** — only address what reviewers asked for, don't refactor surrounding code
- **If Codex review is unavailable** (opencode not installed), skip Stage 3 and go straight to user approval with a note that Codex review was skipped
- **Respect the existing codebase patterns** — match the style, conventions, and patterns already in use
- **If a reviewer comment is ambiguous**, note the ambiguity in the plan and ask the user for clarification before implementing
