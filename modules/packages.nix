{ pkgs, ... }:

{
  # Packages already installed via other means (brew, bun, fnm, manual):
  #   ripgrep, jq, coreutils, curl     — brew
  #   bun                               — standalone installer
  #   fnm                               — brew
  #   pnpm, node                        — fnm
  #   zig                               — zigup (~/.zig/)
  #   go, deno, python3                 — brew
  #   gh, glab                          — brew
  #   kubectl, stern                    — brew
  #   biome                             — npm/pnpm
  #
  # This file is a placeholder. Uncomment packages below to migrate them
  # from brew/manual installs to nix-managed:

  home.packages = with pkgs; [
    # Add packages here as you migrate them to nix
  ];
}
