{ config, ... }:

{
  home.file.".config/opencode/opencode.json".source = ../configs/opencode/opencode.json;
}
