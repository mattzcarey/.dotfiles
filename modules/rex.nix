{ config, ... }:

# Rex: terminal multiplexer (https://www.superlogical.com/rex).
#
# The app is not nix-managed; this module only links its config.
# After editing, choose Reload Config in Rex.

let
  dotfiles = "${config.home.homeDirectory}/Documents/Github/.dotfiles";
  link = config.lib.file.mkOutOfStoreSymlink;
in
{
  # Writable link so edits to ~/.config/rex/init.lua land in the repo.
  home.file.".config/rex/init.lua".source = link "${dotfiles}/configs/rex/init.lua";
}
