import SwiftUI

/// A built-in profile effect drawn as particles, like the web app's canvas effects
struct BuiltinProfileEffect: View {
    let id: String

    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                BuiltinEffectArt.draw(id, into: context, size: size,
                                      time: timeline.date.timeIntervalSince(start))
            }
        }
        .allowsHitTesting(false)
    }
}

/// A still frame of a built-in profile effect, for a settings tile
struct BuiltinEffectPreview: View {
    let id: String

    var body: some View {
        Canvas { context, size in
            BuiltinEffectArt.draw(id, into: context, size: size, time: 1.6, scale: 0.5)
        }
        .allowsHitTesting(false)
    }
}

/// The built-in effects that can be drawn as particles and how each one moves
enum BuiltinEffectArt {
    /// Whether an effect id is one of the drawn ones. `eevee-stars` needs the web's bitmap sprite
    /// strip, so it is recognised as a built-in but drawn by neither this view nor the picker.
    static func draws(_ id: String) -> Bool { specs[id] != nil || scenes[id] != nil }

    /// Draws one frame of an effect over a whole profile card
    static func draw(_ id: String, into context: GraphicsContext, size: CGSize, time: Double,
                     scale: CGFloat = 1) {
        let width = Double(size.width)
        let height = Double(size.height)
        guard width > 0, height > 0 else { return }
        if let scene = scenes[id] {
            drawScene(scene, into: context, width: width, height: height, time: time, scale: scale)
            return
        }
        guard let spec = specs[id] else { return }

        for index in 0..<spec.count {
            let fill = spec.colors[index % spec.colors.count]
            let radius = CGFloat((spec.size.lowerBound
                + (spec.size.upperBound - spec.size.lowerBound) * noise(index, 1)) * Double(scale))
            let phase = noise(index, 2) * .pi * 2
            switch spec.motion {
            case .falling, .rising:
                let speed = spec.speed.lowerBound
                    + (spec.speed.upperBound - spec.speed.lowerBound) * noise(index, 3)
                let travel = height + 60
                let travelled = (noise(index, 4) * travel + time * speed)
                    .truncatingRemainder(dividingBy: travel)
                let falling = spec.motion == .falling
                let y = falling ? travelled - 30 : height + 30 - travelled
                let x = noise(index, 5) * width + sin(time * 0.8 + phase) * 6
                let spin = (noise(index, 6) - 0.5) * 2 * time + phase
                draw(spec.shape, into: context, x: x, y: y, radius: radius, rotation: spin,
                     fill: fill, stroke: spec.stroke, alpha: 0.9, age: travelled / max(speed, 1),
                     phase: phase)
            case .twinkle, .wander:
                let life = spec.life.lowerBound
                    + (spec.life.upperBound - spec.life.lowerBound) * noise(index, 3)
                let age = (time + noise(index, 4) * life).truncatingRemainder(dividingBy: life)
                let alpha = sin(age / life * .pi) * 0.95
                let wander = spec.motion == .wander ? 10.0 : 3.0
                let x = noise(index, 5) * width + sin(time * 0.6 + phase) * wander
                let y = noise(index, 6) * height + cos(time * 0.5 + phase) * wander - age * 2
                draw(spec.shape, into: context, x: x, y: y, radius: radius, rotation: phase,
                     fill: fill, stroke: spec.stroke, alpha: alpha, age: age, phase: phase)
            }
        }
    }

    private enum Motion: Equatable {
        case falling, rising, twinkle, wander
    }

    private enum Shape: Equatable {
        case star, heart, snowflake, sparkle, bubble, confetti, firefly, leaf
    }

    private struct Spec {
        let count: Int
        let motion: Motion
        let shape: Shape
        let speed: ClosedRange<Double>
        let size: ClosedRange<Double>
        let life: ClosedRange<Double>
        let colors: [Color]
        let stroke: Color?
    }

    private static let specs: [String: Spec] = [
        "falling-stars": Spec(count: 18, motion: .falling, shape: .star, speed: 35...75, size: 4...8,
                              life: 0...1, colors: [Color(hex: "#fcd34d")],
                              stroke: Color(hex: "#b47800").opacity(0.55)),
        "hearts": Spec(count: 14, motion: .rising, shape: .heart, speed: 18...42, size: 4...7,
                       life: 0...1, colors: [Color(hex: "#f472b6")],
                       stroke: Color(hex: "#9d174d").opacity(0.45)),
        "snow": Spec(count: 28, motion: .falling, shape: .snowflake, speed: 14...34, size: 2.5...5,
                     life: 0...1, colors: [Color(hex: "#ffffff")],
                     stroke: Color(hex: "#6482aa").opacity(0.5)),
        "sparkles": Spec(count: 20, motion: .twinkle, shape: .sparkle, speed: 1...1, size: 5...10,
                         life: 1.2...2.4, colors: [Color(hex: "#fef08a")],
                         stroke: Color(hex: "#eab308").opacity(0.6)),
        "bubbles": Spec(count: 14, motion: .rising, shape: .bubble, speed: 14...28, size: 4...9,
                        life: 0...1, colors: [Color(hex: "#bae6fd")],
                        stroke: Color(hex: "#38bdf8").opacity(0.55)),
        "confetti": Spec(count: 22, motion: .falling, shape: .confetti, speed: 40...70, size: 3.5...5.5,
                         life: 0...1,
                         colors: [Color(hex: "#f87171"), Color(hex: "#fbbf24"), Color(hex: "#34d399"),
                                  Color(hex: "#60a5fa"), Color(hex: "#a78bfa"), Color(hex: "#f472b6")],
                         stroke: nil),
        "fireflies": Spec(count: 16, motion: .wander, shape: .firefly, speed: 1...1, size: 1.8...2.8,
                          life: 3...6, colors: [Color(hex: "#ecfccb")], stroke: nil),
        "autumn-leaves": Spec(count: 14, motion: .falling, shape: .leaf, speed: 20...34, size: 5...8,
                              life: 0...1,
                              colors: [Color(hex: "#e0792b"), Color(hex: "#c2410c"), Color(hex: "#b45309"),
                                       Color(hex: "#a16207"), Color(hex: "#9a3412")],
                              stroke: Color(hex: "#5a280a").opacity(0.45)),
    ]

    private static func draw(_ shape: Shape, into context: GraphicsContext, x: Double, y: Double,
                             radius: CGFloat, rotation: Double, fill: Color, stroke: Color?, alpha: Double,
                             age: Double, phase: Double) {
        let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
            .rotated(by: CGFloat(rotation))
        let color = fill.opacity(alpha)
        switch shape {
        case .bubble:
            let body = Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2))
                .applying(move)
            context.fill(body, with: .color(color))
            if let stroke { context.stroke(body, with: .color(stroke.opacity(alpha)), lineWidth: 1) }
            let highlight = Path(ellipseIn: CGRect(x: -radius * 0.63, y: -radius * 0.63, width: radius * 0.56,
                                                   height: radius * 0.56)).applying(move)
            context.fill(highlight, with: .color(Color.white.opacity(alpha * 0.85)))
        case .firefly:
            let glow = Path(ellipseIn: CGRect(x: -radius * 3.2, y: -radius * 3.2, width: radius * 6.4,
                                              height: radius * 6.4)).applying(move)
            context.fill(glow, with: .color(Color(hex: "#bef264").opacity(alpha * 0.22)))
            let core = Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2))
                .applying(move)
            context.fill(core, with: .color(color))
        case .confetti:
            let squash = max(0.15, abs(cos(age * 4 + phase)))
            let rectangle = Path { path in
                path.addRect(CGRect(x: -radius, y: -radius * 0.5, width: radius * 2, height: radius))
            }
            .applying(move.scaledBy(x: 1, y: CGFloat(squash)))
            context.fill(rectangle, with: .color(color))
        default:
            let outline = path(shape, radius: radius).applying(move)
            context.fill(outline, with: .color(color))
            if let stroke { context.stroke(outline, with: .color(stroke.opacity(alpha)), lineWidth: 1) }
            if case .leaf = shape {
                var midrib = Path()
                midrib.move(to: CGPoint(x: 0, y: -radius * 0.85))
                midrib.addLine(to: CGPoint(x: 0, y: radius * 0.85))
                context.stroke(midrib.applying(move), with: .color(Color(hex: "#3c1905").opacity(alpha * 0.45)),
                               lineWidth: 1)
            }
        }
    }

    private static func path(_ shape: Shape, radius: CGFloat) -> Path {
        var path = Path()
        switch shape {
        case .star:
            for index in 0..<10 {
                let r = index.isMultiple(of: 2) ? radius : radius * 0.45
                let angle = (-90.0 + Double(index) * 36.0) * .pi / 180
                let point = CGPoint(x: r * CGFloat(cos(angle)), y: r * CGFloat(sin(angle)))
                if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
            }
            path.closeSubpath()
        case .heart:
            path.move(to: CGPoint(x: 0, y: radius * 0.9))
            path.addCurve(to: CGPoint(x: 0, y: -radius * 0.35),
                          control1: CGPoint(x: -radius * 1.4, y: -radius * 0.1),
                          control2: CGPoint(x: -radius * 0.7, y: -radius * 1.1))
            path.addCurve(to: CGPoint(x: 0, y: radius * 0.9),
                          control1: CGPoint(x: radius * 0.7, y: -radius * 1.1),
                          control2: CGPoint(x: radius * 1.4, y: -radius * 0.1))
            path.closeSubpath()
        case .sparkle:
            let k = radius * 0.14
            path.move(to: CGPoint(x: 0, y: -radius))
            path.addQuadCurve(to: CGPoint(x: radius, y: 0), control: CGPoint(x: k, y: -k))
            path.addQuadCurve(to: CGPoint(x: 0, y: radius), control: CGPoint(x: k, y: k))
            path.addQuadCurve(to: CGPoint(x: -radius, y: 0), control: CGPoint(x: -k, y: k))
            path.addQuadCurve(to: CGPoint(x: 0, y: -radius), control: CGPoint(x: -k, y: -k))
            path.closeSubpath()
        case .leaf:
            path.move(to: CGPoint(x: 0, y: -radius))
            path.addCurve(to: CGPoint(x: 0, y: radius),
                          control1: CGPoint(x: radius * 0.8, y: -radius * 0.6),
                          control2: CGPoint(x: radius * 0.8, y: radius * 0.5))
            path.addCurve(to: CGPoint(x: 0, y: -radius),
                          control1: CGPoint(x: -radius * 0.8, y: radius * 0.5),
                          control2: CGPoint(x: -radius * 0.8, y: -radius * 0.6))
            path.closeSubpath()
        default:
            path.addEllipse(in: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2))
        }
        return path
    }

    // MARK: The five effects spawned with rules of their own

    /// The effects whose particles each pick their own shape and life, as the web's spawn functions do
    private enum Scene: Equatable {
        case sparks, mud, hands, intrusion, hijack
    }

    private static let scenes: [String: (scene: Scene, count: Int)] = [
        "claude-sparks": (.sparks, 16),
        "mud-splatter": (.mud, 16),
        "creeping-hands": (.hands, 8),
        "signal-intrusion": (.intrusion, 18),
        "broadcast-hijack": (.hijack, 16),
    ]

    private static func drawScene(_ scene: (scene: Scene, count: Int), into context: GraphicsContext,
                                  width: Double, height: Double, time: Double, scale: CGFloat) {
        switch scene.scene {
        case .sparks:
            drawSparks(count: scene.count, into: context, width: width, height: height,
                       time: time, scale: scale)
        case .mud:
            drawMudSplatter(count: scene.count, into: context, width: width, height: height,
                            time: time, scale: scale)
        case .hands:
            drawCreepingHands(count: scene.count, into: context, width: width, height: height,
                              time: time, scale: scale)
        case .intrusion:
            drawSignalIntrusion(count: scene.count, into: context, width: width, height: height,
                                time: time, scale: scale)
        case .hijack:
            drawBroadcastHijack(count: scene.count, into: context, width: width, height: height,
                                time: time, scale: scale)
        }
    }

    /// `claude-sparks`: rising sparks, one in six of them a blocky critter
    private static func drawSparks(count: Int, into context: GraphicsContext, width: Double,
                                   height: Double, time: Double, scale: CGFloat) {
        let travel = height + 60
        for index in 0..<count {
            let critter = noise(index, 1) < 0.18
            let phase = noise(index, 2) * .pi * 2
            let speed = critter ? between(9...14, noise(index, 3)) : between(8...16, noise(index, 3))
            let travelled = (noise(index, 4) * travel + time * speed)
                .truncatingRemainder(dividingBy: travel)
            let x = between(8...max(8, width - 8), noise(index, 5)) + sin(time * 0.8 + phase) * 6
            let y = height + 30 - travelled
            let size = critter ? between(4...5.5, noise(index, 6)) : between(4...7, noise(index, 6))
            let radius = CGFloat(size * Double(scale))
            let rotation = critter ? 0 : (noise(index, 7) - 0.5) * 2 * time + phase
            let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
                .rotated(by: CGFloat(rotation))
            if critter {
                // Body, ears and legs as blocks, then two darker eyes.
                let unit = radius * 0.4
                let body = Path { path in
                    path.addRect(CGRect(x: -2 * unit, y: -2 * unit, width: 4 * unit, height: 3 * unit))
                    path.addRect(CGRect(x: -2 * unit, y: -3 * unit, width: unit, height: unit))
                    path.addRect(CGRect(x: unit, y: -3 * unit, width: unit, height: unit))
                    path.addRect(CGRect(x: -2 * unit, y: unit, width: unit, height: 2 * unit))
                    path.addRect(CGRect(x: unit, y: unit, width: unit, height: 2 * unit))
                }.applying(move)
                context.fill(body, with: .color(Color(hex: "#d97757").opacity(0.9)))
                let eyes = Path { path in
                    path.addRect(CGRect(x: -1.2 * unit, y: -1.2 * unit, width: 0.5 * unit,
                                        height: 0.8 * unit))
                    path.addRect(CGRect(x: 0.7 * unit, y: -1.2 * unit, width: 0.5 * unit,
                                        height: 0.8 * unit))
                }.applying(move)
                context.fill(eyes, with: .color(Color(hex: "#5a2314").opacity(0.81)))
            } else {
                let life = between(3...5, noise(index, 8))
                let age = (time + noise(index, 9) * life).truncatingRemainder(dividingBy: life)
                let alpha = fading(age, life)
                let points = [4, 6, 8][Int(noise(index, 10) * 3) % 3]
                let twinkle = 0.75 + 0.25 * sin(age * 3 + phase)
                let spark = asteriskPath(radius: radius * CGFloat(twinkle), points: points)
                    .applying(move)
                context.fill(spark, with: .color(Color(hex: "#d97757").opacity(alpha)))
                context.stroke(spark, with: .color(Color(hex: "#963c23").opacity(0.5 * alpha)),
                               lineWidth: 1)
            }
        }
    }

    /// `mud-splatter`: falling blobs, stretching drips and fast specks
    private static func drawMudSplatter(count: Int, into context: GraphicsContext, width: Double,
                                        height: Double, time: Double, scale: CGFloat) {
        let travel = height + 60
        let mud = Color(hex: "#5b3a1e")
        let mudStroke = Color(hex: "#3e2611")
        for index in 0..<count {
            let roll = noise(index, 1)
            let shape = roll < 0.18 ? 2 : roll < 0.45 ? 1 : 0
            let phase = noise(index, 2) * .pi * 2
            let speed: Double
            let size: Double
            switch shape {
            case 2:
                speed = between(60...90, noise(index, 3))
                size = between(1...1.8, noise(index, 5))
            case 1:
                speed = between(30...45, noise(index, 3))
                size = between(4...6, noise(index, 5))
            default:
                speed = between(22...38, noise(index, 3))
                size = between(5...9, noise(index, 5))
            }
            let travelled = (noise(index, 4) * travel + time * speed)
                .truncatingRemainder(dividingBy: travel)
            let radius = CGFloat(size * Double(scale))
            let x = noise(index, 6) * width + sin(time * 0.8 + phase) * 6
            let y = travelled - 30
            let age = travelled / max(speed, 1)
            let rotation = shape == 0 ? phase + (noise(index, 7) - 0.5) * 0.6 * time : 0
            let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
                .rotated(by: CGFloat(rotation))
            if shape == 2 {
                context.fill(circled(radius).applying(move), with: .color(mud.opacity(0.9)))
            } else {
                let stretch = shape == 1 ? CGFloat(1 + min(age * 0.9, 1.4)) : 1
                let blob = mudBlobPath(radius: radius, phase: phase)
                    .applying(CGAffineTransform(scaleX: 0.85, y: stretch))
                    .applying(move)
                context.fill(blob, with: .color(mud.opacity(0.9)))
                context.stroke(blob, with: .color(mudStroke.opacity(0.9)), lineWidth: 1)
                let highlight = circled(radius * 0.18)
                    .applying(CGAffineTransform(translationX: -radius * 0.3, y: -radius * 0.3))
                    .applying(move)
                context.fill(highlight, with: .color(Color(hex: "#aa7d50").opacity(0.54)))
            }
        }
    }

    /// `creeping-hands`: pale hands rising from the bottom edge, and wisps of mist drifting across
    private static func drawCreepingHands(count: Int, into context: GraphicsContext, width: Double,
                                          height: Double, time: Double, scale: CGFloat) {
        let mist = Color(hex: "#cdd6cc")
        for index in 0..<count {
            let phase = noise(index, 2) * .pi * 2
            if noise(index, 1) < 0.4 {
                let radius = CGFloat(between(22...34, noise(index, 3)) * Double(scale))
                let travel = width + 60
                let drift = between(6...12, noise(index, 4))
                let x = (noise(index, 5) * travel + time * drift)
                    .truncatingRemainder(dividingBy: travel) - 30
                let start = between(height * 0.3...height * 0.95, noise(index, 6))
                let rise = between(1...3, noise(index, 7))
                let y = start - wrapped(time * rise, start + 40)
                let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
                let outer = Path(ellipseIn: CGRect(x: -radius * 1.9, y: -radius * 0.5,
                                                   width: radius * 3.8, height: radius))
                    .applying(move)
                context.fill(outer, with: .color(mist.opacity(0.09)))
                let wisp = Path(ellipseIn: CGRect(x: radius * 0.5 - radius * 1.1,
                                                  y: -radius * 0.2 - radius * 0.34,
                                                  width: radius * 2.2, height: radius * 0.68))
                    .applying(move)
                context.fill(wisp, with: .color(mist.opacity(0.09)))
            } else {
                let size = between(7...9, noise(index, 3)) * Double(scale)
                let life = between(9...13, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let progress = min(1, age / life)
                // Each hand is hidden for the last part of its cycle, so they come and go.
                guard progress > 0, progress <= 0.72 else { continue }
                let up = easeOutCubic(min(1, progress / 0.3))
                let down = max(0, (progress - 0.5) / 0.22)
                let k = CGFloat(size / 4.5)
                let offset = CGFloat((1 - up + min(1, down)) * 40 * size / 4.5)
                let grip = 0.5 - 0.5 * cos(age * 1.3 + phase)
                let x = between(12...max(12, width - 12), noise(index, 6))
                let rotation = (noise(index, 7) - 0.5) * 0.24
                let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(height - 6))
                    .rotated(by: CGFloat(rotation))
                let hand = handPath()
                    .applying(CGAffineTransform(scaleX: k, y: k * CGFloat(1 - 0.14 * grip)))
                    .applying(CGAffineTransform(translationX: 0, y: offset))
                    .applying(move)
                context.fill(hand, with: .color(Color(hex: "#c4bdaf").opacity(0.9)))
                context.stroke(hand, with: .color(Color(hex: "#282824").opacity(0.72)),
                               lineWidth: 0.5)
            }
        }
    }

    /// `signal-intrusion`: a bloodshot eye, tearing signal lines and flickering marks
    private static func drawSignalIntrusion(count: Int, into context: GraphicsContext, width: Double,
                                            height: Double, time: Double, scale: CGFloat) {
        for index in 0..<count {
            let roll = noise(index, 1)
            let phase = noise(index, 2) * .pi * 2
            if roll < 0.46 {
                let size = between(12...20, noise(index, 3)) * Double(scale)
                let life = between(3.2...6, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let x = between(18...max(18, width - 18), noise(index, 6)) + sin(time * 0.8 + phase) * 6
                let y = between(16...max(16, height - 16), noise(index, 7))
                drawSignalEye(into: context, x: x, y: y, radius: CGFloat(size),
                              rotation: (noise(index, 8) - 0.5) * 0.52,
                              alpha: fading(age, life), age: age, phase: phase,
                              cyan: noise(index, 9) < 0.28)
            } else if roll < 0.8 {
                let size = CGFloat(between(48...118, noise(index, 3)) * Double(scale))
                let life = between(0.9...2.1, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let startX = between(width * 0.15...width * 0.85, noise(index, 6)) + 40
                let x = wrapped(startX + time * between(-14...14, noise(index, 7)),
                                width + 80) - 40
                let startY = between(8...max(8, height - 8), noise(index, 8)) + 40
                let y = wrapped(startY + time * between(-18...18, noise(index, 9)),
                                height + 80) - 40
                drawSignalTear(into: context, x: x, y: y, width: size,
                               alpha: fading(age, life), age: age, phase: phase)
            } else {
                let size = CGFloat(between(9...17, noise(index, 3)) * Double(scale))
                let life = between(1.2...2.6, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let x = between(8...max(8, width - 8), noise(index, 6)) + sin(time * 0.8 + phase) * 6
                let startY = between(8...max(8, height - 8), noise(index, 7)) + 40
                let y = wrapped(startY + time * between(8...20, noise(index, 8)),
                                height + 80) - 40
                drawSignalMark(into: context, x: x, y: y, width: size,
                               alpha: fading(age, life), age: age, phase: phase)
            }
        }
    }

    private static func drawSignalEye(into context: GraphicsContext, x: Double, y: Double,
                                      radius: CGFloat, rotation: Double, alpha: Double,
                                      age: Double, phase: Double, cyan: Bool) {
        let blink = sin(age * 7.5 + phase * 3.1)
        let openY = blink > 0.9 ? 0.08 : 1
        let burst = sin(age * 19 + phase * 5.7) > 0.78
        let jitter = burst ? CGFloat(Int((age * 60).rounded(.down)) % 3 - 1) * 4.5 : 0
        let move = CGAffineTransform(translationX: CGFloat(x) + jitter, y: CGFloat(y))
            .rotated(by: CGFloat(rotation))
        let r = radius
        let eyeHeight = r * 0.64 * CGFloat(openY)
        if burst {
            let left = Path { path in
                path.move(to: CGPoint(x: -r - 3, y: 0))
                path.addQuadCurve(to: CGPoint(x: r - 3, y: 0),
                                  control: CGPoint(x: -3, y: -eyeHeight * 1.3))
                path.addQuadCurve(to: CGPoint(x: -r - 3, y: 0),
                                  control: CGPoint(x: -3, y: eyeHeight * 1.3))
            }.applying(move)
            context.stroke(left, with: .color(Color(hex: "#00f0ff").opacity(0.78 * alpha)),
                           lineWidth: 1.5)
            let right = Path { path in
                path.move(to: CGPoint(x: -r + 3, y: 0))
                path.addQuadCurve(to: CGPoint(x: r + 3, y: 0),
                                  control: CGPoint(x: 3, y: -eyeHeight * 1.3))
                path.addQuadCurve(to: CGPoint(x: -r + 3, y: 0),
                                  control: CGPoint(x: 3, y: eyeHeight * 1.3))
            }.applying(move)
            context.stroke(right, with: .color(Color(hex: "#ff003c").opacity(0.88 * alpha)),
                           lineWidth: 1)
        }
        let almond = eyePath(radius: r * 1.12, height: eyeHeight * 1.45).applying(move)
        context.fill(almond, with: .color(Color(hex: "#040006").opacity(alpha)))
        // The web clips a radial gradient to this lens; rings of solid colour stand in for it here.
        let lens = eyePath(radius: r, height: eyeHeight * 1.25).applying(move)
        context.fill(lens, with: .color(Color(hex: "#fecdd3").opacity(alpha)))
        let veins = Path { path in
            path.move(to: CGPoint(x: -r * 0.88, y: -eyeHeight * 0.2))
            path.addLine(to: CGPoint(x: -r * 0.46, y: -eyeHeight * 0.05))
            path.move(to: CGPoint(x: -r * 0.82, y: eyeHeight * 0.25))
            path.addLine(to: CGPoint(x: -r * 0.42, y: eyeHeight * 0.08))
            path.move(to: CGPoint(x: r * 0.88, y: -eyeHeight * 0.18))
            path.addLine(to: CGPoint(x: r * 0.45, y: -eyeHeight * 0.04))
            path.move(to: CGPoint(x: r * 0.8, y: eyeHeight * 0.22))
            path.addLine(to: CGPoint(x: r * 0.44, y: eyeHeight * 0.07))
        }.applying(move)
        context.stroke(veins, with: .color(Color(hex: "#be123c").opacity(0.78 * alpha)),
                       lineWidth: max(0.7, r * 0.045))
        let stepTick = (age * 4.2 + phase * 4.3).rounded(.down)
        let gx = CGFloat(sin(stepTick * 2.7)) * r * 0.22
        let gy = CGFloat(cos(stepTick * 3.9)) * eyeHeight * 0.2
        let iris = r * 0.42
        let fringe = burst ? CGFloat(2.6) : 1.1
        context.fill(circle(centerX: gx - fringe, centerY: gy, radius: iris).applying(move),
                     with: .color(Color(hex: "#00f0ff").opacity(0.55 * alpha)))
        context.fill(circle(centerX: gx + fringe, centerY: gy, radius: iris).applying(move),
                     with: .color(Color(hex: "#ff003c").opacity(0.6 * alpha)))
        let rings: [String]
        if cyan {
            rings = ["#020c10", "#0e7490", "#00f0ff", "#ecfeff"]
        } else {
            rings = ["#040006", "#3b0414", "#be123c", "#ff003c"]
        }
        for (step, hex) in rings.enumerated() {
            let ring = iris * (1 - CGFloat(step) * 0.22)
            context.fill(circle(centerX: gx, centerY: gy, radius: ring).applying(move),
                         with: .color(Color(hex: hex).opacity(alpha)))
        }
        let pupil = iris * (burst ? 0.34 : 0.48)
        if cyan {
            let slit = Path(ellipseIn: CGRect(x: gx - pupil * 0.45, y: gy - pupil * 1.25,
                                              width: pupil * 0.9, height: pupil * 2.5))
                .applying(move)
            context.fill(slit, with: .color(Color(hex: "#030005").opacity(alpha)))
        } else {
            context.fill(circle(centerX: gx, centerY: gy, radius: pupil).applying(move),
                         with: .color(Color(hex: "#030005").opacity(alpha)))
        }
        context.fill(circle(centerX: gx - iris * 0.32, centerY: gy - iris * 0.3,
                            radius: max(1, r * 0.09)).applying(move),
                     with: .color(Color.white.opacity(0.92 * alpha)))
        context.stroke(lens, with: .color(burst ? Color(hex: "#ff003c").opacity(alpha)
                                               : Color(hex: "#09010d").opacity(alpha)),
                       lineWidth: max(1.2, r * 0.09))
    }

    private static func drawSignalTear(into context: GraphicsContext, x: Double, y: Double,
                                       width: CGFloat, alpha: Double, age: Double,
                                       phase: Double) {
        guard sin(age * 22 + phase * 2.3) >= 0.15 else { return }
        let tearHeight = max(2.5, width * 0.055)
        let shift = CGFloat(Int((age * 45 + phase * 10).rounded(.down)) % 5 - 2) * 5
        let move = CGAffineTransform(translationX: CGFloat(x) + shift, y: CGFloat(y))
        let cyan = rectangle(-width * 0.5 - 5, -tearHeight * 0.6, width * 0.85,
                             tearHeight * 0.65).applying(move)
        context.fill(cyan, with: .color(Color(hex: "#00f0ff").opacity(0.68 * alpha)))
        let red = rectangle(-width * 0.5 + 4, -tearHeight * 0.3, width,
                            tearHeight * 0.75).applying(move)
        context.fill(red, with: .color(Color(hex: "#ff003c").opacity(0.84 * alpha)))
        let black = rectangle(-width * 0.35, -tearHeight * 0.5, width * 0.7,
                              tearHeight).applying(move)
        context.fill(black, with: .color(Color(hex: "#050108").opacity(0.92 * alpha)))
        var snow = Path()
        for step in 0..<4 {
            let forward = Double(step * 37) + (age * 70).rounded(.down)
            let dx = CGFloat(forward.truncatingRemainder(dividingBy: 100) / 100 - 0.5)
                * width * 0.65
            snow.addRect(CGRect(x: dx, y: -tearHeight * 0.25,
                                width: 4 + CGFloat(step % 3) * 3,
                                height: max(1.2, tearHeight * 0.45)))
        }
        context.fill(snow.applying(move), with: .color(Color(hex: "#f8fafc").opacity(0.88 * alpha)))
    }

    private static func drawSignalMark(into context: GraphicsContext, x: Double, y: Double,
                                       width: CGFloat, alpha: Double, age: Double,
                                       phase: Double) {
        guard sin(age * 26 + phase * 4.1) >= 0.1 else { return }
        let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
        context.fill(rectangle(-width * 0.6, -1.5, width * 1.2, 3).applying(move),
                     with: .color(Color(hex: "#ff003c").opacity(0.82 * alpha)))
        context.fill(rectangle(-width * 0.4 + 3, 1.5, width * 0.8, 2).applying(move),
                     with: .color(Color(hex: "#00f0ff").opacity(0.72 * alpha)))
        context.fill(rectangle(-1.5, -width * 0.5, 3, width).applying(move),
                     with: .color(Color(hex: "#050108").opacity(0.88 * alpha)))
    }

    /// `broadcast-hijack`: a monochrome silhouette head, VHS dropout lines and an OSD block
    private static func drawBroadcastHijack(count: Int, into context: GraphicsContext, width: Double,
                                            height: Double, time: Double, scale: CGFloat) {
        for index in 0..<count {
            let roll = noise(index, 1)
            let phase = noise(index, 2) * .pi * 2
            if roll < 0.42 {
                let size = CGFloat(between(14...22, noise(index, 3)) * Double(scale))
                let life = between(3.6...6.4, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let x = between(22...max(22, width - 22), noise(index, 6)) + sin(time * 0.8 + phase) * 6
                let y = between(24...max(24, height - 24), noise(index, 7))
                drawBroadcastHead(into: context, x: x, y: y, radius: size,
                                  rotation: (noise(index, 8) - 0.5) * 0.16,
                                  alpha: fading(age, life), age: age, phase: phase)
            } else if roll < 0.82 {
                let size = CGFloat(between(60...145, noise(index, 3)) * Double(scale))
                let life = between(1.1...2.4, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let startX = between(width * 0.15...width * 0.85, noise(index, 6)) + 40
                let x = wrapped(startX + time * between(-10...10, noise(index, 7)),
                                width + 80) - 40
                let startY = between(6...max(6, height - 6), noise(index, 8)) + 40
                let y = wrapped(startY + time * between(16...36, noise(index, 9)),
                                height + 80) - 40
                drawBroadcastLine(into: context, x: x, y: y, width: size,
                                  alpha: fading(age, life), age: age, phase: phase)
            } else {
                let size = CGFloat(between(12...18, noise(index, 3)) * Double(scale))
                let life = between(1.4...2.8, noise(index, 4))
                let age = (time + noise(index, 5) * life).truncatingRemainder(dividingBy: life)
                let x = between(24...max(24, width - 24), noise(index, 6)) + sin(time * 0.8 + phase) * 6
                let y = between(16...max(16, height - 16), noise(index, 7))
                drawBroadcastBox(into: context, x: x, y: y, width: size,
                                 alpha: fading(age, life), age: age, phase: phase)
            }
        }
    }

    private static func drawBroadcastHead(into context: GraphicsContext, x: Double, y: Double,
                                          radius: CGFloat, rotation: Double, alpha: Double,
                                          age: Double, phase: Double) {
        let pale = Color(hex: "#f4f4f0")
        let black = Color(hex: "#020204")
        let outline = Color(hex: "#d6d3cd")
        let slip = sin(age * 16 + phase * 4.7) > 0.8
        let jitter = slip ? CGFloat(Int((age * 50).rounded(.down)) % 3 - 1) * 4 : 0
        let move = CGAffineTransform(translationX: CGFloat(x) + jitter, y: CGFloat(y))
            .rotated(by: CGFloat(rotation))
        let r = radius
        let head = CGRect(x: -r * 0.76, y: -r * 1.12, width: r * 1.52, height: r * 2.24)
        context.fill(Path(ellipseIn: head).applying(move), with: .color(black.opacity(alpha)))
        context.stroke(Path(ellipseIn: head).applying(move),
                       with: .color(outline.opacity(0.78 * alpha)), lineWidth: 1.1)
        let eyeX = r * 0.32
        let eyeY = -r * 0.22
        let eyeRadiusX = r * 0.24
        let eyeRadiusY = r * 0.17
        let left = CGRect(x: -eyeX - eyeRadiusX, y: eyeY - eyeRadiusY,
                          width: eyeRadiusX * 2, height: eyeRadiusY * 2)
        let right = CGRect(x: eyeX - eyeRadiusX, y: eyeY - eyeRadiusY,
                           width: eyeRadiusX * 2, height: eyeRadiusY * 2)
        context.fill(Path(ellipseIn: left).applying(move), with: .color(pale.opacity(alpha)))
        context.fill(Path(ellipseIn: right).applying(move), with: .color(pale.opacity(alpha)))
        let gazeStep = (age * 3.2 + phase * 5).rounded(.down)
        let px = CGFloat(sin(gazeStep * 2.1)) * eyeRadiusX * 0.25
        let py = CGFloat(cos(gazeStep * 3.3)) * eyeRadiusY * 0.25
        let pupil = max(1.1, r * 0.065)
        context.fill(circle(centerX: -eyeX + px, centerY: eyeY + py, radius: pupil).applying(move),
                     with: .color(black.opacity(alpha)))
        context.fill(circle(centerX: eyeX + px, centerY: eyeY + py, radius: pupil).applying(move),
                     with: .color(black.opacity(alpha)))
        let jaw = slip ? CGFloat(1.32) : 1
        let grin = Path { path in
            path.move(to: CGPoint(x: -r * 0.44, y: r * 0.28))
            path.addQuadCurve(to: CGPoint(x: r * 0.44, y: r * 0.28),
                              control: CGPoint(x: 0, y: r * 0.16))
            path.addQuadCurve(to: CGPoint(x: 0, y: r * 0.72 * jaw),
                              control: CGPoint(x: r * 0.32, y: r * 0.72 * jaw))
            path.addQuadCurve(to: CGPoint(x: -r * 0.44, y: r * 0.28),
                              control: CGPoint(x: -r * 0.32, y: r * 0.72 * jaw))
            path.closeSubpath()
        }.applying(move)
        context.fill(grin, with: .color(pale.opacity(alpha)))
        let teeth = Path { path in
            path.move(to: CGPoint(x: -r * 0.38, y: r * 0.46 * jaw))
            path.addLine(to: CGPoint(x: r * 0.38, y: r * 0.46 * jaw))
            for step in -2...2 {
                let tx = CGFloat(step) * r * 0.14
                path.move(to: CGPoint(x: tx, y: r * 0.25))
                path.addLine(to: CGPoint(x: tx, y: r * 0.68 * jaw))
            }
        }.applying(move)
        context.stroke(teeth, with: .color(black.opacity(alpha)),
                       lineWidth: max(0.9, r * 0.06))
        if sin(age * 3.8 + phase * 2.1) > -0.15 {
            let slipY = slip ? r * 0.26 : 0
            let top = eyeY - eyeRadiusY * 1.2 + slipY
            let bar = rectangle(-r * 0.72, top, r * 1.44, eyeRadiusY * 2.4).applying(move)
            context.fill(bar, with: .color(black.opacity(alpha)))
            context.stroke(bar, with: .color(pale.opacity(alpha)), lineWidth: 0.8)
            let label = rectangle(-r * 0.5, eyeY - 1 + slipY, r, 2).applying(move)
            context.fill(label, with: .color(outline.opacity(0.82 * alpha)))
        }
    }

    private static func drawBroadcastLine(into context: GraphicsContext, x: Double, y: Double,
                                          width: CGFloat, alpha: Double, age: Double,
                                          phase: Double) {
        guard sin(age * 24 + phase * 3.1) >= 0.05 else { return }
        let lineHeight = max(1.8, width * 0.025)
        let shift = CGFloat(Int((age * 50 + phase * 9).rounded(.down)) % 5 - 2) * 6
        let move = CGAffineTransform(translationX: CGFloat(x) + shift, y: CGFloat(y))
        let shadow = rectangle(-width * 0.5 + 4, lineHeight * 0.6, width * 0.92,
                               lineHeight).applying(move)
        context.fill(shadow, with: .color(Color(hex: "#020306").opacity(0.9 * alpha)))
        let band = rectangle(-width * 0.5, -lineHeight * 0.5, width,
                             lineHeight).applying(move)
        context.fill(band, with: .color(Color(hex: "#f4f4f0").opacity(0.88 * alpha)))
        var speckles = Path()
        for step in 0..<5 {
            let forward = Double(step * 29) + (age * 80).rounded(.down)
            let dx = CGFloat(forward.truncatingRemainder(dividingBy: 100) / 100 - 0.5)
                * width * 0.85
            speckles.addRect(CGRect(x: dx, y: -lineHeight * 0.5,
                                    width: 3 + CGFloat(step % 3) * 4, height: lineHeight))
        }
        context.fill(speckles.applying(move), with: .color(Color(hex: "#020306").opacity(alpha)))
    }

    private static func drawBroadcastBox(into context: GraphicsContext, x: Double, y: Double,
                                         width: CGFloat, alpha: Double, age: Double,
                                         phase: Double) {
        guard sin(age * 18 + phase * 3.7) >= 0.2 else { return }
        let pale = Color(hex: "#f4f4f0")
        let boxWidth = width * 1.8
        let boxHeight = width * 0.52
        let move = CGAffineTransform(translationX: CGFloat(x), y: CGFloat(y))
        let box = rectangle(-boxWidth * 0.5, -boxHeight * 0.5, boxWidth,
                            boxHeight).applying(move)
        context.fill(box, with: .color(Color(hex: "#020306").opacity(0.92 * alpha)))
        context.stroke(box, with: .color(Color(hex: "#d6d3cd").opacity(0.85 * alpha)),
                       lineWidth: 1)
        let play = Path { path in
            path.move(to: CGPoint(x: -boxWidth * 0.38, y: -boxHeight * 0.26))
            path.addLine(to: CGPoint(x: -boxWidth * 0.38, y: boxHeight * 0.26))
            path.addLine(to: CGPoint(x: -boxWidth * 0.22, y: 0))
            path.closeSubpath()
        }.applying(move)
        context.fill(play, with: .color(pale.opacity(alpha)))
        let first = rectangle(-boxWidth * 0.14, -boxHeight * 0.18, boxWidth * 0.24,
                              boxHeight * 0.36).applying(move)
        context.fill(first, with: .color(pale.opacity(alpha)))
        let second = rectangle(boxWidth * 0.16, -boxHeight * 0.18, boxWidth * 0.22,
                               boxHeight * 0.36).applying(move)
        context.fill(second, with: .color(pale.opacity(alpha)))
    }

    // MARK: Shapes and maths the scenes share

    /// A rounded multi-point asterisk: `points` soft spikes around the centre
    private static func asteriskPath(radius: CGFloat, points: Int) -> Path {
        var path = Path()
        let inner = radius * 0.32
        let step = Double.pi * 2 / Double(points)
        for index in 0..<points {
            let angle = -Double.pi / 2 + Double(index) * step
            let next = angle + step
            let middle = angle + step / 2
            let point = CGPoint(x: radius * CGFloat(cos(angle)), y: radius * CGFloat(sin(angle)))
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
            path.addQuadCurve(
                to: CGPoint(x: radius * CGFloat(cos(next)), y: radius * CGFloat(sin(next))),
                control: CGPoint(x: inner * CGFloat(cos(middle)),
                                 y: inner * CGFloat(sin(middle))))
        }
        path.closeSubpath()
        return path
    }

    /// An irregular wobbly blob centred on the origin; `phase` varies the wobble per particle
    private static func mudBlobPath(radius: CGFloat, phase: Double) -> Path {
        let count = 9
        var points: [CGPoint] = []
        for index in 0..<count {
            let angle = Double(index) / Double(count) * .pi * 2
            let length = Double(radius) * (1 + 0.18 * sin(3 * angle + phase)
                + 0.1 * sin(5 * angle + phase * 1.7))
            points.append(CGPoint(x: CGFloat(length * cos(angle)),
                                  y: CGFloat(length * sin(angle))))
        }
        func midpoint(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
            CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        }
        var path = Path()
        path.move(to: midpoint(points[count - 1], points[0]))
        for index in 0..<count {
            path.addQuadCurve(to: midpoint(points[index], points[(index + 1) % count]),
                              control: points[index])
        }
        path.closeSubpath()
        return path
    }

    /// One pale hand silhouette: palm, four fingers and a thumb, about 22 units tall
    private static func handPath() -> Path {
        var path = Path()
        path.move(to: CGPoint(x: -9, y: 0))
        path.addLine(to: CGPoint(x: -9, y: 16))
        path.addQuadCurve(to: CGPoint(x: -4, y: 22), control: CGPoint(x: -9, y: 22))
        path.addLine(to: CGPoint(x: 4, y: 22))
        path.addQuadCurve(to: CGPoint(x: 9, y: 16), control: CGPoint(x: 9, y: 22))
        path.addLine(to: CGPoint(x: 9, y: 0))
        path.closeSubpath()
        path.move(to: CGPoint(x: -8.6, y: 0))
        path.addLine(to: CGPoint(x: -8.6, y: -11.4))
        path.addQuadCurve(to: CGPoint(x: -5.4, y: -11.4), control: CGPoint(x: -7, y: -13))
        path.addLine(to: CGPoint(x: -5.4, y: 0))
        path.closeSubpath()
        path.move(to: CGPoint(x: -4.1, y: 0))
        path.addLine(to: CGPoint(x: -4.1, y: -14.3))
        path.addQuadCurve(to: CGPoint(x: -0.7, y: -14.3), control: CGPoint(x: -2.4, y: -16))
        path.addLine(to: CGPoint(x: -0.7, y: 0))
        path.closeSubpath()
        path.move(to: CGPoint(x: 0.75, y: 0))
        path.addLine(to: CGPoint(x: 0.75, y: -13.35))
        path.addQuadCurve(to: CGPoint(x: 4.05, y: -13.35), control: CGPoint(x: 2.4, y: -15))
        path.addLine(to: CGPoint(x: 4.05, y: 0))
        path.closeSubpath()
        path.move(to: CGPoint(x: 4.95, y: 0))
        path.addLine(to: CGPoint(x: 4.95, y: -9.55))
        path.addQuadCurve(to: CGPoint(x: 7.85, y: -9.55), control: CGPoint(x: 6.4, y: -11))
        path.addLine(to: CGPoint(x: 7.85, y: 0))
        path.closeSubpath()
        path.move(to: CGPoint(x: -8, y: 12))
        path.addLine(to: CGPoint(x: -13.2, y: 4.5))
        path.addQuadCurve(to: CGPoint(x: -10.6, y: 1.5), control: CGPoint(x: -14.2, y: 2.8))
        path.addLine(to: CGPoint(x: -6, y: 8))
        path.closeSubpath()
        return path
    }

    /// The pointed almond both the eye's socket and its lens are cut from
    private static func eyePath(radius: CGFloat, height: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: -radius, y: 0))
        path.addQuadCurve(to: CGPoint(x: radius, y: 0), control: CGPoint(x: 0, y: -height))
        path.addQuadCurve(to: CGPoint(x: -radius, y: 0), control: CGPoint(x: 0, y: height))
        path.closeSubpath()
        return path
    }

    private static func circled(_ radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2))
    }

    private static func circle(centerX: CGFloat, centerY: CGFloat, radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: centerX - radius, y: centerY - radius,
                               width: radius * 2, height: radius * 2))
    }

    private static func rectangle(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat,
                                  _ height: CGFloat) -> Path {
        Path { path in path.addRect(CGRect(x: x, y: y, width: width, height: height)) }
    }

    private static func between(_ range: ClosedRange<Double>, _ amount: Double) -> Double {
        range.lowerBound + (range.upperBound - range.lowerBound) * amount
    }

    /// `value` folded into `0..<span`, so a drifting particle comes back round
    private static func wrapped(_ value: Double, _ span: Double) -> Double {
        guard span > 0 else { return 0 }
        let remainder = value.truncatingRemainder(dividingBy: span)
        return remainder < 0 ? remainder + span : remainder
    }

    private static func fading(_ age: Double, _ life: Double) -> Double {
        sin(age / life * .pi) * 0.95
    }

    private static func easeOutCubic(_ amount: Double) -> Double {
        let rest = 1 - amount
        return 1 - rest * rest * rest
    }

    private static func noise(_ index: Int, _ salt: Double) -> Double {
        let value = sin(Double(index) * 12.9898 + salt * 78.233) * 43758.5453
        return value - value.rounded(.down)
    }
}
