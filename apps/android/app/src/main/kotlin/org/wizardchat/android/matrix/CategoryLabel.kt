package org.wizardchat.android.matrix

/** The header of a Modern category: its name, else its canonical alias, else [generic]. Never a raw room ID. */
fun categoryHeader(name: String?, canonicalAlias: String?, generic: String): String =
    name?.takeIf { it.isNotBlank() } ?: canonicalAlias?.takeIf { it.isNotBlank() } ?: generic
