{ config, pkgs, ... }:

{
  programs.git = {
    enable = true;
    settings = {
      user.name = "Matt Carey";
      user.email = "mcarey@cloudflare.com";
    };
  };
}
