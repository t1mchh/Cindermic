// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CindermicAudio",
    platforms: [.iOS(.v17)],
    products: [.library(name: "CindermicAudio", targets: ["CindermicAudio"])],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.6.0")
    ],
    targets: [
        .target(
            name: "CindermicAudio",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")],
            path: "ios/Sources/CindermicAudio"
        )
    ]
)
