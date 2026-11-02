import WizardChatCore

extension ListDiff {
    func apply(to items: inout [T]) {
        switch self {
        case .append(let diff): items.append(contentsOf: diff.values)
        case .clear: items.removeAll()
        case .pushFront(let diff): items.insert(diff.value, at: 0)
        case .pushBack(let diff): items.append(diff.value)
        case .popFront: if !items.isEmpty { items.removeFirst() }
        case .popBack: if !items.isEmpty { items.removeLast() }
        case .insert(let diff): items.insert(diff.value, at: min(diff.index, items.count))
        case .set(let diff): if items.indices.contains(diff.index) { items[diff.index] = diff.value }
        case .remove(let diff): if items.indices.contains(diff.index) { items.remove(at: diff.index) }
        case .truncate(let diff): if diff.length < items.count { items.removeSubrange(diff.length...) }
        case .reset(let diff): items = diff.values
        }
    }

    func map<U>(_ transform: (T) -> U) -> [ListChange<U>] {
        switch self {
        case .append(let diff): return [.append(diff.values.map(transform))]
        case .clear: return [.reset([])]
        case .pushFront(let diff): return [.insert(0, transform(diff.value))]
        case .pushBack(let diff): return [.append([transform(diff.value)])]
        case .popFront: return [.remove(0)]
        case .popBack: return [.removeLast]
        case .insert(let diff): return [.insert(diff.index, transform(diff.value))]
        case .set(let diff): return [.set(diff.index, transform(diff.value))]
        case .remove(let diff): return [.remove(diff.index)]
        case .truncate(let diff): return [.truncate(diff.length)]
        case .reset(let diff): return [.reset(diff.values.map(transform))]
        }
    }
}

enum ListChange<T> {
    case append([T])
    case insert(Int, T)
    case set(Int, T)
    case remove(Int)
    case removeLast
    case truncate(Int)
    case reset([T])

    func apply(to items: inout [T]) {
        switch self {
        case .append(let values): items.append(contentsOf: values)
        case .insert(let index, let value): items.insert(value, at: min(index, items.count))
        case .set(let index, let value): if items.indices.contains(index) { items[index] = value }
        case .remove(let index): if items.indices.contains(index) { items.remove(at: index) }
        case .removeLast: if !items.isEmpty { items.removeLast() }
        case .truncate(let length): if length < items.count { items.removeSubrange(length...) }
        case .reset(let values): items = values
        }
    }
}

extension Array {
    mutating func apply(_ changes: [ListChange<Element>]) {
        changes.forEach { $0.apply(to: &self) }
    }
}
