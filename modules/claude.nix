{ config, ... }:

{
  home.file.".claude/settings.json".source = ../configs/claude/settings.json;
  home.file.".claude/hooks/check-duplicate-functions.sh" = {
    source = ../configs/claude/hooks/check-duplicate-functions.sh;
    executable = true;
  };
  home.file.".claude/hooks/no-dynamic-imports.sh" = {
    source = ../configs/claude/hooks/no-dynamic-imports.sh;
    executable = true;
  };
  home.file.".claude/commands/set-zagi-override.md".source = ../configs/claude/commands/set-zagi-override.md;

  # Skills
  home.file.".claude/skills/work/SKILL.md".source = ../configs/claude/skills/work/SKILL.md;
  home.file.".claude/skills/new-cf-worker/SKILL.md".source = ../configs/claude/skills/new-cf-worker/SKILL.md;
  home.file.".claude/skills/review-fix/SKILL.md".source = ../configs/claude/skills/review-fix/SKILL.md;
  home.file.".claude/skills/codex-review/SKILL.md".source = ../configs/claude/skills/codex-review/SKILL.md;
  home.file.".claude/skills/chrome-cdp/SKILL.md".source = ../configs/claude/skills/chrome-cdp/SKILL.md;
  home.file.".claude/skills/chrome-cdp/scripts/cdp.mjs" = {
    source = ../configs/claude/skills/chrome-cdp/scripts/cdp.mjs;
    executable = true;
  };
}
