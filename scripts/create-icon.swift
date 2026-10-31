import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let size = NSSize(width: 1024, height: 1024)
let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
    bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false,
    isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let rect = NSRect(origin: .zero, size: size)
NSGradient(
    starting: NSColor(srgbRed: 0.11, green: 0.13, blue: 0.08, alpha: 1),
    ending: NSColor(srgbRed: 0.045, green: 0.05, blue: 0.04, alpha: 1))!.draw(in: rect, angle: -45)
NSColor(srgbRed: 0.88, green: 0.98, blue: 0.21, alpha: 1).setStroke()
for (x, height) in [(256.0, 150.0), (384, 350), (512, 520), (640, 280), (768, 120)] {
    let path = NSBezierPath()
    path.lineWidth = 55
    path.lineCapStyle = .round
    path.move(to: NSPoint(x: x, y: (1024 - height) / 2))
    path.line(to: NSPoint(x: x, y: (1024 + height) / 2))
    path.stroke()
}
NSGraphicsContext.restoreGraphicsState()
let png = bitmap.representation(using: .png, properties: [:])!
let assets = root.appendingPathComponent("public")
try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
try png.write(to: assets.appendingPathComponent("app-icon.png"))
