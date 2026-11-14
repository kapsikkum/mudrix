import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The composer's text field as a UITextView, so pasting images works: the keyboard's paste
/// button and the edit menu hand images to `onPaste` instead of dropping them (SwiftUI's
/// TextField only takes text). Grows up to `maxLines`, then scrolls.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var selection: NSRange
    @Binding var isFocused: Bool
    let placeholder: String
    let font: UIFont
    let textColor: UIColor
    let placeholderColor: UIColor
    let tintColor: UIColor
    var maxLines = 6
    let onPaste: ([NSItemProvider]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> PastingTextView {
        let view = PastingTextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = false
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.onPasteItems = { providers in context.coordinator.parent.onPaste(providers) }
        view.addSubview(view.placeholderLabel)
        return view
    }

    func updateUIView(_ view: PastingTextView, context: Context) {
        context.coordinator.parent = self
        view.font = font
        view.textColor = textColor
        view.tintColor = tintColor
        view.placeholderLabel.font = font
        view.placeholderLabel.textColor = placeholderColor
        view.placeholderLabel.text = placeholder
        let length = (text as NSString).length
        if view.text != text {
            // Text set from outside: keep a cursor the parent set with it (formatting), otherwise
            // (a picked suggestion, an emoji) keep typing at the end, not where the cursor was
            let cursorMoved = selection != view.selectedRange
            view.text = text
            let range = cursorMoved && selection.location + selection.length <= length
                ? selection : NSRange(location: length, length: 0)
            view.selectedRange = range
            if range != selection { DispatchQueue.main.async { context.coordinator.parent.selection = range } }
        } else if view.selectedRange != selection, selection.location + selection.length <= length {
            view.selectedRange = selection
        }
        view.placeholderLabel.isHidden = !text.isEmpty
        if isFocused != view.isFirstResponder {
            let wantsFocus = isFocused
            DispatchQueue.main.async {
                if wantsFocus { view.becomeFirstResponder() } else { view.resignFirstResponder() }
            }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView view: PastingTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 300
        let fitting = view.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
        let maxHeight = ceil(font.lineHeight * CGFloat(maxLines))
        let height = min(max(fitting, ceil(font.lineHeight)), maxHeight)
        let scrolls = fitting > maxHeight
        if view.isScrollEnabled != scrolls {
            DispatchQueue.main.async { view.isScrollEnabled = scrolls }
        }
        return CGSize(width: width, height: height)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerTextView
        init(_ parent: ComposerTextView) { self.parent = parent }

        func textViewDidChange(_ view: UITextView) {
            parent.text = view.text
            (view as? PastingTextView)?.placeholderLabel.isHidden = !view.text.isEmpty
        }

        func textViewDidChangeSelection(_ view: UITextView) {
            if parent.selection != view.selectedRange { parent.selection = view.selectedRange }
        }

        func textViewDidBeginEditing(_ view: UITextView) {
            if !parent.isFocused { parent.isFocused = true }
        }

        func textViewDidEndEditing(_ view: UITextView) {
            if parent.isFocused { parent.isFocused = false }
        }
    }
}

final class PastingTextView: UITextView {
    var onPasteItems: (([NSItemProvider]) -> Void)?
    let placeholderLabel = UILabel()

    private static let mediaTypes: [UTType] = [.image, .movie, .fileURL, .pdf]

    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        pasteConfiguration = UIPasteConfiguration(acceptableTypeIdentifiers:
            [UTType.plainText, .text, .url, .image, .movie, .fileURL, .pdf].map(\.identifier))
        placeholderLabel.numberOfLines = 1
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        placeholderLabel.frame = CGRect(x: 0, y: 0, width: bounds.width, height: font?.lineHeight ?? 20)
    }

    private func hasMedia(_ providers: [NSItemProvider]) -> Bool {
        providers.contains { provider in
            Self.mediaTypes.contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
                && !provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }
    }

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), UIPasteboard.general.hasImages { return true }
        return super.canPerformAction(action, withSender: sender)
    }

    override func paste(_ sender: Any?) {
        let providers = UIPasteboard.general.itemProviders
        if UIPasteboard.general.hasImages || hasMedia(providers) {
            onPasteItems?(providers)
        } else {
            super.paste(sender)
        }
    }

    override func paste(itemProviders: [NSItemProvider]) {
        if hasMedia(itemProviders) {
            onPasteItems?(itemProviders)
        } else {
            super.paste(itemProviders: itemProviders)
        }
    }
}
