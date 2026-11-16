# Nix entry point: `nix build .#mudrix`, `nixosModules.mudrix` and `overlays.default`.
#
# The package is the prebuilt Linux tarball from a release, not a from-source build (nix/package.nix
# says why). To build the tarball yourself, for example the one CI made:
#
#   MUDRIX_TARBALL=$PWD/mudrix-26.12.2-linux-x86_64.tar.gz nix build --impure .#mudrix
#
# `--impure` is for the path, which comes from the environment. Without it the release is fetched, and
# `nix/package.nix`'s `sha256` has to be filled in first (docs/BUILDING.md).
{
  description = "Mudrix, a Matrix client";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      localTarball = builtins.getEnv "MUDRIX_TARBALL";

      mkMudrix =
        pkgs: pkgs.callPackage ./nix/package.nix (nixpkgs.lib.optionalAttrs (localTarball != "") {
          tarball = builtins.toPath localTarball;
        });
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          mudrix = mkMudrix pkgs;
        in
        {
          inherit mudrix;
          default = mudrix;
        }
      );

      overlays.default = final: _prev: {
        mudrix = final.callPackage ./nix/package.nix { };
      };

      nixosModules.mudrix = import ./nix/module.nix;
      nixosModules.default = self.nixosModules.mudrix;
    };
}
