{ config, pkgs, ... }:

{
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;

    oh-my-zsh = {
      enable = true;
      theme = "robbyrussell";
      plugins = [ "git" ];
    };

    shellAliases = {
      p = "pnpm";
      g = "git";
      gco = "git checkout";
      gcob = "git checkout -b";
      cc = "claude --dangerously-skip-permissions";
      oc = "opencode";
      z = "/Applications/Zed\\ Preview.app/Contents/MacOS/cli";
      ksh = "kubectl --kubeconfig ~/.kube/sherlock.yaml";
    };

    initExtra = ''
      # zagi - git wrapper
      alias git='/Users/matt/Documents/Github/zagi/zig-out/bin/zagi'
      export ZAGI_AGENT=claude
      export ZAGI_STRIP_COAUTHORS=1

      # bun completions
      [ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

      # fnm
      eval "$(fnm env --use-on-cd)"
    '';

    envExtra = ''
      # bun
      export BUN_INSTALL="$HOME/.bun"
      export PATH="$BUN_INSTALL/bin:$PATH"

      # pnpm
      export PNPM_HOME="$HOME/Library/pnpm"
      case ":$PATH:" in
        *":$PNPM_HOME:"*) ;;
        *) export PATH="$PNPM_HOME:$PATH" ;;
      esac

      # zig
      export PATH="$HOME/.zig/0.16.0-dev:$PATH"

      # opencode
      export OPENCODE_HOME="$HOME/.opencode"
      export PATH="$OPENCODE_HOME/bin:$PATH"

      # claude
      export PATH="$HOME/.local/bin:$PATH"

      # libpq
      export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

      # sst
      export SST_HOME="$HOME/.sst"
      export PATH="$SST_HOME/bin:$PATH"
    '';
  };
}
