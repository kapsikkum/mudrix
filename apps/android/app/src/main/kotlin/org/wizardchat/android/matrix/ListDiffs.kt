package org.wizardchat.android.matrix

import org.wizardchat.core.ListDiff

/** Applies a change from the core to a local copy of the list */
fun <T> ListDiff<T>.applyTo(items: MutableList<T>) {
    when (this) {
        is ListDiff.Append -> items.addAll(values)
        ListDiff.Clear -> items.clear()
        is ListDiff.PushFront -> items.add(0, value)
        is ListDiff.PushBack -> items.add(value)
        ListDiff.PopFront -> if (items.isNotEmpty()) items.removeAt(0)
        ListDiff.PopBack -> if (items.isNotEmpty()) items.removeAt(items.lastIndex)
        is ListDiff.Insert -> items.add(minOf(index.toInt(), items.size), value)
        is ListDiff.Set -> if (index.toInt() in items.indices) items[index.toInt()] = value
        is ListDiff.Remove -> if (index.toInt() in items.indices) items.removeAt(index.toInt())
        is ListDiff.Truncate -> while (items.size > length.toInt()) items.removeAt(items.lastIndex)
        is ListDiff.Reset -> {
            items.clear()
            items.addAll(values)
        }
    }
}

/** The same change for a list of mapped items (e.g. timeline rows built from entries) */
fun <T, U> ListDiff<T>.mapTo(items: MutableList<U>, transform: (T) -> U) {
    when (this) {
        is ListDiff.Append -> items.addAll(values.map(transform))
        ListDiff.Clear -> items.clear()
        is ListDiff.PushFront -> items.add(0, transform(value))
        is ListDiff.PushBack -> items.add(transform(value))
        ListDiff.PopFront -> if (items.isNotEmpty()) items.removeAt(0)
        ListDiff.PopBack -> if (items.isNotEmpty()) items.removeAt(items.lastIndex)
        is ListDiff.Insert -> items.add(minOf(index.toInt(), items.size), transform(value))
        is ListDiff.Set -> if (index.toInt() in items.indices) items[index.toInt()] = transform(value)
        is ListDiff.Remove -> if (index.toInt() in items.indices) items.removeAt(index.toInt())
        is ListDiff.Truncate -> while (items.size > length.toInt()) items.removeAt(items.lastIndex)
        is ListDiff.Reset -> {
            items.clear()
            items.addAll(values.map(transform))
        }
    }
}
