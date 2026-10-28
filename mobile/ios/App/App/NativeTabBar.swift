import UIKit

struct NativeTab: Equatable {
    let id: String
    let label: String
    let active: Bool
    let badge: String?
    let call: Bool

    var symbol: String {
        switch id {
        case "home": return "house"
        case "dms": return "bubble.left.and.bubble.right"
        case "spaces": return "square.stack"
        case "inbox": return "tray"
        case "you": return "person.crop.circle"
        default: return "circle"
        }
    }

    var badgeColor: UIColor? {
        switch badge {
        case "mention": return .systemRed
        case "dot": return UIColor(red: 0.45, green: 0.42, blue: 0.95, alpha: 1)
        default: return call ? .systemGreen : nil
        }
    }
}

final class NativeTabBar: NSObject, UITabBarDelegate {
    static let shared = NativeTabBar()

    var onSelect: ((String) -> Void)?
    private let bar = UITabBar()
    private var tabs: [NativeTab] = []
    private var visible = false
    private var pending: (index: Int, since: Date)?

    func install(in view: UIView) {
        bar.delegate = self
        bar.overrideUserInterfaceStyle = .dark
        bar.tintColor = .white
        bar.alpha = 0
        bar.isUserInteractionEnabled = false
        view.addSubview(bar)
    }

    func layout(in view: UIView) {
        view.bringSubviewToFront(bar)
        let size = bar.sizeThatFits(view.bounds.size)
        bar.frame = CGRect(
            x: 0,
            y: view.bounds.height - size.height,
            width: view.bounds.width,
            height: size.height
        )
    }

    func update(visible: Bool, tabs newTabs: [NativeTab]) {
        if newTabs.isEmpty {
            setVisible(false)
            return
        }
        let structureChanged =
            newTabs.map(\.id) != tabs.map(\.id) || newTabs.map(\.label) != tabs.map(\.label)
        if structureChanged {
            let items = newTabs.enumerated().map { index, tab -> UITabBarItem in
                let item = UITabBarItem(
                    title: tab.label,
                    image: UIImage(systemName: tab.symbol),
                    selectedImage: UIImage(systemName: "\(tab.symbol).fill")
                )
                item.tag = index
                return item
            }
            bar.setItems(items, animated: false)
        }
        tabs = newTabs

        for (index, tab) in newTabs.enumerated() {
            guard let item = bar.items?[index] else { continue }
            let color = tab.badgeColor
            if item.badgeColor != color { item.badgeColor = color }
            let value: String? = color == nil ? nil : ""
            if item.badgeValue != value { item.badgeValue = value }
        }

        let active = newTabs.firstIndex(where: \.active)
        if let pending, Date().timeIntervalSince(pending.since) < 1, active != pending.index {
        } else {
            pending = nil
            let item = active.flatMap { bar.items?[$0] }
            if bar.selectedItem !== item { bar.selectedItem = item }
        }

        setVisible(visible)
    }

    private func setVisible(_ visible: Bool) {
        guard visible != self.visible else { return }
        self.visible = visible
        bar.isUserInteractionEnabled = visible
        UIView.animate(withDuration: 0.15) { self.bar.alpha = visible ? 1 : 0 }
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard tabs.indices.contains(item.tag) else { return }
        pending = (item.tag, Date())
        onSelect?(tabs[item.tag].id)
    }
}
