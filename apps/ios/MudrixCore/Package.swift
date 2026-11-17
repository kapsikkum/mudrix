// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MudrixCore",
    platforms: [.iOS(.v18)],
    products: [.library(name: "MudrixCore", targets: ["MudrixCore"])],
    targets: [
        // Built by scripts/build-core.sh
        .binaryTarget(name: "MudrixCoreFFI", path: "MudrixCoreFFI.xcframework"),
        .target(
            name: "MudrixCore",
            dependencies: ["MudrixCoreFFI"],
            path: "Sources/MudrixCore",
            linkerSettings: [.linkedFramework("SystemConfiguration"), .linkedFramework("Security"), .linkedLibrary("sqlite3")]
        ),
    ],
    swiftLanguageModes: [.v5]
)
