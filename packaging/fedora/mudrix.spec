# Template: packaging/ci/make-linux-tarball.mjs fills Version, Release and Source0 from package.json
# and the tarball the Linux CI job builds, and the Fedora job runs `rpmbuild -bb` on the result.
# See docs/BUILDING.md ("Distribution packages").
#
# There is no %build: the app is the prebuilt Tauri binary, so the tarball (a deb's usr/ tree plus
# LICENSE) is only unpacked and installed. Compiling it here would need the whole Rust and Node
# toolchain and hours of CI time.
# Nothing is compiled here and the release binary brings its own symbols: skip the -debuginfo subpackage.
%global debug_package %{nil}

Name:           mudrix
Version:        0.0.0
Release:        1
Summary:        Simple, secure, magical Matrix client
URL:            https://github.com/kapsikkum/mudrix
License:        AGPL-3.0-only
Source0:        mudrix-0.0.0-linux-x86_64.tar.gz
BuildArch:      x86_64
# The tarball is prebuilt; unpacking it is the whole build.
BuildRequires:  tar
# What the WebKitGTK webview, the tray icon (libayatana-appindicator) and voice/video need at runtime.
# The tray library is dlopened: libappindicator-sys tries libayatana-appindicator3.so.1 first and falls
# back to libappindicator3.so.1, which is what Fedora's libappindicator-gtk3 provides.
Requires:       webkit2gtk4.1
Requires:       gtk3
Requires:       libappindicator-gtk3
Requires:       alsa-lib
Requires:       gstreamer1-plugins-base
Requires:       gstreamer1-plugins-good
# Voice and video calls use more codecs than the two plugin packages above carry; both are optional.
Recommends:     gstreamer1-plugins-bad-free
Recommends:     gstreamer1-plugin-libav

%description
Mudrix is a Matrix client: a Tauri desktop app whose web UI and Rust core are bundled into one
binary. This package installs the prebuilt Linux build.

%prep
# The tarball has usr/ and LICENSE at its root, not a mudrix-<version>/ directory.
%setup -q -c -T
tar -xzf %{SOURCE0}

%build
# Nothing to build.

%install
mkdir -p %{buildroot}
cp -a usr %{buildroot}/
install -Dpm644 LICENSE %{buildroot}%{_licensedir}/%{name}/LICENSE

%files
%{_bindir}/*
%{_datadir}/applications/*
%{_datadir}/icons/*
%license %{_licensedir}/%{name}/LICENSE

%changelog
