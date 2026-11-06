{ config, ... }:

# Hex (anomaly.hex, https://github.com/anomalyco/hex): local dictation app.
#
# Not nix-managed. Install it with:
#   brew install --cask anomalyco/tap/hex
# Transcription models are downloaded from inside the app.

let
  dotfiles = "${config.home.homeDirectory}/Documents/Github/.dotfiles";
  link = config.lib.file.mkOutOfStoreSymlink;
in
{
  # Writable link: Hex saves settings from its UI, so the store copy would be read-only.
  home.file."Library/Application Support/hex/settings.json".source =
    link "${dotfiles}/configs/hex/settings.json";
}
