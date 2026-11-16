# Building

| App     | Command                 | Result                                                                                     |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Web     | `npm run build`         | `apps/web/dist/` (or `docker build -t mudrix .`)                                           |
| Desktop | `npm run desktop:build` | `target/release/bundle/`, for the platform you build on                                    |
| iOS     | `npm run ios:build`     | `apps/ios/build/Build/Products/Release-iphoneos/WizardChat.app` (shown as "Mudrix" on iOS) |
| Android | `npm run android:build` | `apps/android/app/build/outputs/apk/gplay/release/app-gplay-release.apk`                   |

`npm run desktop:release` builds the desktop app with updater artifacts (it needs `TAURI_SIGNING_PRIVATE_KEY` and its
password in the environment, see [RELEASING.md](../RELEASING.md)). The iOS product keeps its upstream target name
`WizardChat`, so the bundle on disk is still `WizardChat.app`; the name people see, the bundle id and the URL scheme are
Mudrix's.

The Android app has two flavours: `gplay` (push notifications through Firebase; its config is
`apps/android/app/src/gplay/res/values/firebase.xml`, from the Firebase project's `google-services.json`) and `fdroid`
(no Google code).

## Releases

How versions, tags and signing work, and which parts of the release process are not automated yet, is in
[RELEASING.md](../RELEASING.md). The GitHub Actions workflows in `.github/workflows/` check the code and build unsigned
test builds; [docs/CI.md](CI.md) describes them. `.gitlab-ci.yml` and `apps/desktop/scripts/publish-update.mjs` are
upstream's GitLab release pipeline (GitLab package registry, Cloudflare Pages, `mudrix-desktop` feed); they are not used
here and will be replaced.

The "What's new" notes in the apps come from `whatsnew/<version>.md`.

## Distribution packages

Three Linux package formats install the same tree: `mudrix-<version>-linux-x86_64.tar.gz`, which holds `usr/` (the
desktop app from the deb bundle) and `LICENSE`. `apps/desktop/scripts/package-linux.mjs` makes it for a signed release;
`packaging/ci/make-linux-tarball.mjs` makes it for CI from the debug Linux build and also fills the Arch and Fedora
metadata for that tarball. The Desktop workflow builds all three packages on runs that build the Linux bundles and
uploads them as `mudrix-arch-package`, `mudrix-fedora-package` and `mudrix-linux-tarball` (see [CI.md](CI.md)).

### Arch (`packaging/aur/mudrix-bin/PKGBUILD`)

`mudrix-bin` copies `usr/` from the release tarball and lists the libraries the prebuilt binary needs
(`webkit2gtk-4.1`, `gtk3`, `libayatana-appindicator`, `gst-plugins-base`/`good`). CI fills `_version`, `pkgver` and
`sha256sums` for the local tarball and runs `makepkg --nodeps --holdver` on `archlinux:latest`, because nothing is
compiled there. To build by hand, run `makepkg -f` in `packaging/aur/mudrix-bin` after filling it the same way, or take
the PKGBUILD next to the CI tarball.

### Fedora and rpm-ostree systems (`packaging/fedora/mudrix.spec`)

The spec unpacks the tarball into `/usr` and requires `webkit2gtk4.1`, `gtk3`, `libappindicator-gtk3`, `alsa-lib` and
`gstreamer1-plugins-base`/`good`; `gstreamer1-plugins-bad-free` and `-libav` are recommended for more call codecs. A
normal rpm is what Bazzite and other rpm-ostree systems install, for example
`rpm-ostree install ./mudrix-<version>-1.fc43.x86_64.rpm`. RPM cannot take a `-` in a version, so a pre-release
`26.12.1-next.1` becomes `Version: 26.12.1`, `Release: 0.next.1`. CI fills the template and runs `rpmbuild -bb` on
`fedora:latest`; locally, put the tarball in `~/rpmbuild/SOURCES` and the filled spec in `~/rpmbuild/SPECS`, then run
`rpmbuild -bb ~/rpmbuild/SPECS/mudrix.spec`.

### Nix (flake)

`flake.nix` exposes `packages.x86_64-linux.mudrix`, `overlays.default` and `nixosModules.mudrix`. The package installs
the same tarball with `autoPatchelfHook` and a GTK/GStreamer wrapper, so it runs against nixpkgs' WebKitGTK 4.1.

```sh
nix build .#mudrix                       # downloads the release tarball (its sha256 must be filled in first)
MUDRIX_TARBALL=$PWD/mudrix-26.12.2-linux-x86_64.tar.gz nix build --impure .#mudrix   # or a local one
nix flake check --no-build               # evaluates the flake without building the package
```

There is deliberately **no from-source Rust build**: it needs the whole Rust and Node toolchain and takes well over an
hour, which CI cannot afford for a packaging check. `nix/package.nix` takes `version`, `sha256` and `src` as arguments;
fill `sha256` with `nix store prefetch-file <tarball url>` once a release carries the tarball, or point `MUDRIX_TARBALL`
at a tarball you built. A `flake.lock` is not committed yet: the first evaluation resolves and locks nixpkgs in the store
copy, and `nix flake lock` in the repository would pin it.

In a NixOS configuration (as a flake input called `mudrix`):

```nix
{
  imports = [ inputs.mudrix.nixosModules.mudrix ];
  programs.mudrix = {
    enable = true;
    autostart = false;  # a system-wide XDG autostart entry; the app's own setting is per user
    tray = true;        # on GNOME, installs the AppIndicator extension
  };
}
```

The module's `package` option defaults to the flake's own package; `overlays.default` provides the same thing as
`pkgs.mudrix`, which is handy for `environment.systemPackages`.
