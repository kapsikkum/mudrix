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
    /// Whether an effect id is one of the drawn ones
    static func draws(_ id: String) -> Bool { specs[id] != nil }

    /// Draws one frame of an effect over a whole profile card
    static func draw(_ id: String, into context: GraphicsContext, size: CGSize, time: Double,
                     scale: CGFloat = 1) {
        guard let spec = specs[id] else { return }
        let width = Double(size.width)
        let height = Double(size.height)
        guard width > 0, height > 0 else { return }

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

    private static func noise(_ index: Int, _ salt: Double) -> Double {
        let value = sin(Double(index) * 12.9898 + salt * 78.233) * 43758.5453
        return value - value.rounded(.down)
    }
}
