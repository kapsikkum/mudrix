package org.wizardchat.android.media

import java.util.Locale

/** Sizes the way the web shows them (`formatFileSize`): 1024-based, so "25 MB" in the settings is what the planner uses */
object FileSize {
    fun format(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format(Locale.getDefault(), "%.1f KB", bytes / 1024.0)
        else -> String.format(Locale.getDefault(), "%.1f MB", bytes / (1024.0 * 1024.0))
    }

    fun format(bytes: Double): String = format(bytes.toLong())
}
