{ config, pkgs, ... }:

{
  imports = [
    ./modules/shell.nix
    ./modules/git.nix
    ./modules/editors.nix
    ./modules/claude.nix
    ./modules/pi.nix
    ./modules/opencode.nix
    ./modules/packages.nix
  ];

  home = {
    username = "matt";
    homeDirectory = "/Users/matt";
    stateVersion = "24.11";
  };

  programs.home-manager.enable = true;
}
