// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WizardChatCore",
    platforms: [.iOS(.v18)],
    products: [.library(name: "WizardChatCore", targets: ["WizardChatCore"])],
    targets: [
        // Built by scripts/build-core.sh
        .binaryTarget(name: "WizardChatCoreFFI", path: "WizardChatCoreFFI.xcframework"),
        .target(
            name: "WizardChatCore",
            dependencies: ["WizardChatCoreFFI"],
            path: "Sources/WizardChatCore",
            linkerSettings: [.linkedFramework("SystemConfiguration"), .linkedFramework("Security"), .linkedLibrary("sqlite3")]
        ),
    ],
    swiftLanguageModes: [.v5]
)
