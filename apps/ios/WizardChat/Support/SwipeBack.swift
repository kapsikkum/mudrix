import UIKit

/// Keeps the edge swipe-back working in pushed screens that hide the back button (SwiftUI turns the
/// gesture off then), and never starts it on the root screen.
@MainActor
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
