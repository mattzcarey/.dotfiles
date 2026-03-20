# Set a ZAGI override secret

When a zagi guardrail blocks a destructive git command in agent mode, agents can bypass it using an override key. This skill sets one up.

## How it works

1. The user chooses a secret key (any string)
2. `zagi override-key set` hashes it with a random salt (SHA-256) and stores the hash in local git config (`zagi.override-key`)
3. Agents bypass guardrails by setting the `ZAGI_OVERRIDE_KEY` env var to the matching key

## Steps

1. Confirm this is a git repository by running `git rev-parse --git-dir`
2. Generate a random secret (or ask the user if they want to choose their own):
   ```
   openssl rand -hex 16
   ```
3. Set the override key by piping it to zagi:
   ```
   echo "<secret>" | zagi override-key set
   ```
4. Verify it was stored:
   ```
   git config zagi.override-key
   ```
   The output should match `v1:<32 hex chars>:<64 hex chars>`
5. Tell the user their override secret and explain how to use it:
   - To let an agent bypass guardrails, set `ZAGI_OVERRIDE_KEY=<secret>` in the agent's environment
   - The key is stored as a salted hash — the plaintext is never saved
   - Running `zagi override-key set` again will overwrite the previous key

## Blocked commands (for reference)

These git commands are blocked in agent mode and require the override key:
- `git reset --hard` — discards uncommitted changes
- `git checkout .` — discards working tree changes
- `git clean -f/-fd/-fx` — deletes untracked files
- `git restore . / --worktree` — discards working tree changes
- `git push --force/-f` — overwrites remote history
- `git push --delete/-d` or `push origin :branch` — deletes remote branches
- `git stash drop/clear` — deletes stashed changes
- `git branch -D` — force deletes unmerged branch
