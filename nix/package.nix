# Mudrix for Nix: the prebuilt Linux tarball a release carries (a deb's usr/ tree plus LICENSE),
# wrapped so it runs on NixOS. There is deliberately no from-source build: compiling the Tauri app
# needs the whole Rust and Node toolchain and takes well over an hour, which CI cannot afford.
# See docs/BUILDING.md ("Nix").
{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  wrapGAppsHook3,
  alsa-lib,
  gtk3,
  gst_all_1,
  libayatana-appindicator,
  libsoup_3,
  webkitgtk_4_1,
  xorg,
  # The release the default `src` comes from. It follows the root package.json, which is the source of
  # truth for the version (RELEASING.md); a pre-release is spelled out in full, as in the tarball name
  # (26.12.1-next.1).
  version ? (builtins.fromJSON (builtins.readFile ../package.json)).version,
  # Fill this in once a release carries the tarball: `nix store prefetch-file <url>` prints it.
  sha256 ? lib.fakeHash,
  # Point this at a tarball you built yourself (CI does, from the Linux job):
  #   MUDRIX_TARBALL=$PWD/mudrix-26.12.2-linux-x86_64.tar.gz nix build --impure .#mudrix
  src ? fetchurl {
    url = "https://github.com/kapsikkum/mudrix/releases/download/v${version}/mudrix-${version}-linux-x86_64.tar.gz";
    inherit sha256;
  },
}:
stdenv.mkDerivation {
  pname = "mudrix";
  inherit version src;

  nativeBuildInputs = [
    autoPatchelfHook
    wrapGAppsHook3
  ];

  # What the binary links or loads at runtime: the WebKitGTK 4.1 webview, GTK 3, the tray icon
  # (libayatana-appindicator, which libappindicator-sys dlopens), ALSA and GStreamer for calls, and X11
  # for input and idle detection.
  buildInputs = [
    webkitgtk_4_1
    libsoup_3
    gtk3
    libayatana-appindicator
    alsa-lib
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    xorg.libX11
    xorg.libXi
    xorg.libXtst
    xorg.libxcb
  ];

  # The tarball holds usr/ (bin, applications, icons) and LICENSE at its root.
  installPhase = ''
    runHook preInstall

    mkdir -p $out
    cp -a usr/. $out/
    install -Dm644 LICENSE $out/share/licenses/mudrix/LICENSE

    runHook postInstall
  '';

  # Two things are found by path rather than through the rpath: the tray library, which
  # libappindicator-sys dlopens by soname, and GStreamer's plugins. The wrapper is built in fixupPhase.
  preFixup = ''
    gappsWrapperArgs+=(
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ libayatana-appindicator ]}
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : ${
        lib.makeSearchPath "lib/gstreamer-1.0" [ gst_all_1.gst-plugins-base gst_all_1.gst-plugins-good ]
      }
    )
  '';

  meta = {
    description = "Simple, secure, magical Matrix client";
    homepage = "https://github.com/kapsikkum/mudrix";
    license = lib.licenses.agpl3Only;
    # A release tarball with the compiled app, not something Nix builds from source.
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "mudrix-desktop";
  };
}
