# dotfiles

My dev environment managed with [Nix](https://nixos.org/) + [home-manager](https://github.com/nix-community/home-manager).

## What's in here

| Module | What it manages |
|---|---|
| `shell.nix` | zsh, oh-my-zsh (robbyrussell), aliases, PATH setup (bun, pnpm, fnm, zig, opencode, claude) |
| `git.nix` | Git user config |
| `editors.nix` | VS Code / Cursor / Windsurf (shared settings), Zed (separate) |
| `claude.nix` | [Claude Code](https://cli.anthropic.com) settings, pre-tool-use hooks, custom commands |
| `pi.nix` | [Pi](https://github.com/nichochar/pi) agent settings + opencode-cloudflare extension |
| `opencode.nix` | [OpenCode](https://opencode.ai) config |
| `packages.nix` | Nix-managed packages (empty by default — tools installed via brew/fnm/standalone) |

## Prerequisites

- macOS (aarch64-darwin)
- [Determinate Nix](https://determinate.systems/nix-installer/)

## Setup

```bash
# Clone
git clone https://github.com/mattzcarey/dotfiles.git ~/Documents/Github/dotfiles
cd ~/Documents/Github/dotfiles

# Apply
nix run home-manager -- switch --flake .#matt
```

## After making changes

```bash
home-manager switch --flake .#matt
```

