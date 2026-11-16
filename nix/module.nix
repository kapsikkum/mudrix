# NixOS integration: installs Mudrix and, optionally, starts it at login.
#
#   programs.mudrix.enable = true;
{ config, lib, pkgs, ... }:
let
  cfg = config.programs.mudrix;
in
{
  options.programs.mudrix = {
    enable = lib.mkEnableOption "Mudrix, a Matrix client";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = lib.literalMD "the `mudrix` package from this flake";
      description = ''
        The package to install. With the flake's `overlays.default`, `pkgs.mudrix` is the same thing.
      '';
    };

    autostart = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Start Mudrix at login with a system-wide XDG autostart entry. The app's own "start with the
        system" setting writes a per-user entry, and a per-user entry wins over this one.
      '';
    };

    tray = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Keep the tray icon working on GNOME by installing the AppIndicator extension. Other desktops
        show AppIndicator icons natively and are not touched.
      '';
    };
  };

  config = lib.mkIf cfg.enable (lib.mkMerge [
    { environment.systemPackages = [ cfg.package ]; }

    (lib.mkIf cfg.autostart {
      environment.etc."xdg/autostart/mudrix.desktop".text = ''
        [Desktop Entry]
        Type=Application
        Name=Mudrix
        Comment=Matrix client
        Exec=${cfg.package}/bin/mudrix-desktop --autostart
        Terminal=false
        X-GNOME-Autostart-enabled=true
      '';
    })

    # The tray is a libayatana-appindicator icon, which GNOME only shows with the extension.
    (lib.mkIf (cfg.tray && config.services.xserver.desktopManager.gnome.enable) {
      environment.systemPackages = [ pkgs.gnomeExtensions.appindicator ];
      services.gnome.core-shell.enableExtensions = true;
    })
  ]);
}
