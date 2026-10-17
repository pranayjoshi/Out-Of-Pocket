// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RelayCore",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [.library(name: "RelayCore", targets: ["RelayCore"])],
    targets: [
        .target(name: "RelayCore", resources: [.process("Resources")]),
        .testTarget(name: "RelayCoreTests", dependencies: ["RelayCore"])
    ]
)
