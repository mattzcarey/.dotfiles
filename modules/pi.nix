{ config, ... }:

{
  home.file.".pi/package.json".source = ../configs/pi/package.json;
  home.file.".pi/tsconfig.json".source = ../configs/pi/tsconfig.json;
  home.file.".pi/index.ts".source = ../configs/pi/index.ts;
  home.file.".pi/agent/settings.json".source = ../configs/pi/agent/settings.json;
  home.file.".pi/agent/extensions/opencode-cloudflare".source = ../configs/pi/agent/extensions/opencode-cloudflare;
}
