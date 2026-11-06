{ config, ... }:

# herdr (https://herdr.dev): terminal workspace manager for AI coding agents.
#
# The binary is not nix-managed. Install it with:
#   curl -fsSL https://herdr.dev/install.sh | sh
# It lands in ~/.local/bin/herdr and updates itself with `herdr update`.
#
# Agent integrations are owned by herdr, which overwrites their files on
# update, so they are not vendored here. Reinstall them with:
#   herdr integration install pi
#   herdr integration install claude
#   herdr integration install opencode
#   herdr integration install cursor
# The Claude SessionStart hook that calls the integration script is tracked
# in configs/claude/settings.json.

let
  dotfiles = "${config.home.homeDirectory}/Documents/Github/.dotfiles";
  link = config.lib.file.mkOutOfStoreSymlink;
in
{
  # Writable link so `herdr config reset-keys` and manual edits land in the repo.
  home.file.".config/herdr/config.toml".source = link "${dotfiles}/configs/herdr/config.toml";

  # Dictation keeps spelling herdr as "herder", so make that name work too.
  home.file.".local/bin/herder".source = link "${config.home.homeDirectory}/.local/bin/herdr";
}
