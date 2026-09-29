{ config, ... }:

{
  home.file.".claude/settings.json".source = ../configs/claude/settings.json;
  home.file.".claude/hooks/code-quality.sh" = {
    source = ../configs/claude/hooks/code-quality.sh;
    executable = true;
  };
  home.file.".claude/commands/set-zagi-override.md".source = ../configs/claude/commands/set-zagi-override.md;

  # Skills
  home.file.".claude/skills/work/SKILL.md".source = ../configs/claude/skills/work/SKILL.md;
  home.file.".claude/skills/new-cf-worker/SKILL.md".source = ../configs/claude/skills/new-cf-worker/SKILL.md;
  home.file.".claude/skills/review-fix/SKILL.md".source = ../configs/claude/skills/review-fix/SKILL.md;
  home.file.".claude/skills/codex-review/SKILL.md".source = ../configs/claude/skills/codex-review/SKILL.md;
  home.file.".claude/skills/curl/SKILL.md".source = ../configs/claude/skills/curl/SKILL.md;
  home.file.".claude/skills/diagnose".source = ../configs/claude/skills/diagnose;
  home.file.".claude/skills/grill-with-docs".source = ../configs/claude/skills/grill-with-docs;
  home.file.".claude/skills/improve-codebase-architecture".source = ../configs/claude/skills/improve-codebase-architecture;
  home.file.".claude/skills/install-anti-slop".source = ../configs/claude/skills/install-anti-slop;
  home.file.".claude/skills/product-description".source = ../configs/claude/skills/product-description;
  home.file.".claude/skills/prototype".source = ../configs/claude/skills/prototype;
  home.file.".claude/skills/tdd".source = ../configs/claude/skills/tdd;
  home.file.".claude/skills/thermo-nuclear-code-quality-review".source = ../configs/claude/skills/thermo-nuclear-code-quality-review;
  home.file.".claude/skills/zoom-out".source = ../configs/claude/skills/zoom-out;
  home.file.".claude/skills/chrome-cdp".source = ../configs/claude/skills/chrome-cdp;

  # Skills from https://github.com/dmmulroy/skills
  home.file.".claude/skills/bro".source = ../configs/claude/skills/bro;
  home.file.".claude/skills/cloudflare-composition-root".source = ../configs/claude/skills/cloudflare-composition-root;
  home.file.".claude/skills/coding-standards".source = ../configs/claude/skills/coding-standards;
  home.file.".claude/skills/effect-service-design".source = ../configs/claude/skills/effect-service-design;
  home.file.".claude/skills/tech-spec".source = ../configs/claude/skills/tech-spec;

  # Skills from https://github.com/mattpocock/skills (grill-me invokes grilling)
  home.file.".claude/skills/grill-me".source = ../configs/claude/skills/grill-me;
  home.file.".claude/skills/grilling".source = ../configs/claude/skills/grilling;
  home.file.".claude/skills/domain-modeling".source = ../configs/claude/skills/domain-modeling;

  # Skills from https://github.com/cursor/plugins/tree/main/pstack
  home.file.".claude/skills/unslop".source = ../configs/claude/skills/unslop;

  # Skill by Luke Parker (@LukeParkerDev), shared on X
  home.file.".claude/skills/writing-pr".source = ../configs/claude/skills/writing-pr;
}
