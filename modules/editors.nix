{ config, lib, ... }:

let
  # Canonical VS Code settings - shared across VS Code, Cursor, and Windsurf
  vscodeSettings = builtins.readFile ../configs/vscode/settings.json;
  vscodeKeybindings = builtins.readFile ../configs/vscode/keybindings.json;
in {
  # VS Code
  home.file."Library/Application Support/Code/User/settings.json".text = vscodeSettings;
  home.file."Library/Application Support/Code/User/keybindings.json".text = vscodeKeybindings;

  # Cursor
  home.file."Library/Application Support/Cursor/User/settings.json".source = ../configs/cursor/settings.json;
  home.file."Library/Application Support/Cursor/User/keybindings.json".source = ../configs/cursor/keybindings.json;

  # Zed
  home.file.".config/zed/settings.json".source = ../configs/zed/settings.json;

}
