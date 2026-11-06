# dotfiles

My dev environment managed with [Nix](https://nixos.org/) + [home-manager](https://github.com/nix-community/home-manager).

## What's in here

| Module | What it manages |
|---|---|
| `shell.nix` | zsh, oh-my-zsh (robbyrussell), aliases, PATH setup (bun, pnpm, fnm, zig, opencode, claude) |
| `git.nix` | Git user config |
| `editors.nix` | VS Code, Cursor, and Zed settings |
| `claude.nix` | [Claude Code](https://cli.anthropic.com) settings, pre-tool-use hooks, custom commands |
| `pi.nix` | [Pi](https://github.com/nichochar/pi) agent settings + opencode-cloudflare extension |
| `herdr.nix` | [herdr](https://herdr.dev) config and a `herder` alias for the binary |
| `hex.nix` | [Hex](https://github.com/anomalyco/hex) dictation settings |
| `packages.nix` | Nix-managed packages (empty by default — tools installed via brew/fnm/standalone) |

## Prerequisites

- macOS (aarch64-darwin)
- [Determinate Nix](https://determinate.systems/nix-installer/)

## Setup

```bash
# Clone
git clone https://github.com/mattzcarey/.dotfiles.git ~/Documents/Github/.dotfiles
cd ~/Documents/Github/.dotfiles

# Apply
nix run home-manager -- switch --flake .#matt
```

## Apps installed outside Nix

These need installing before `switch`. Their modules only link config.

```bash
# herdr, then its agent integrations
curl -fsSL https://herdr.dev/install.sh | sh
for agent in pi claude opencode cursor; do herdr integration install "$agent"; done

# Hex
brew install --cask anomalyco/tap/hex
```

## After making changes

```bash
home-manager switch --flake .#matt
```

