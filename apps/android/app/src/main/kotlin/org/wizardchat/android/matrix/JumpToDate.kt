package org.wizardchat.android.matrix

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import org.wizardchat.core.SearchDirection
import org.wizardchat.core.TimestampEvent
import org.wizardchat.core.WizardError

/**
 * The rules of "Jump to date": which message to open for a day, and why a jump was refused.
 * The web app has the same logic in apps/web/src/app/features/timeline/jumpToDate.ts.
 */
object JumpToDate {
    /** Local midnight of [date] as milliseconds since the Unix epoch (not UTC, as the date picker is local) */
    fun startOfDay(date: LocalDate, zone: ZoneId = ZoneId.systemDefault()): Long =
        date.atStartOfDay(zone).toInstant().toEpochMilli()

    /** The day [timestamp] falls on, in [zone] */
    fun dayOf(timestamp: Long, zone: ZoneId = ZoneId.systemDefault()): LocalDate =
        Instant.ofEpochMilli(timestamp).atZone(zone).toLocalDate()

    /**
     * The message to open for a date: the first one at or after it, or the closest earlier one when the room
     * has nothing newer (jumping to a date past its last message). Null for an empty room.
     */
    suspend fun eventNear(timestamp: Long, lookup: suspend (Long, SearchDirection) -> TimestampEvent?): String? {
        val forward = lookup(timestamp, SearchDirection.forward)
        if (forward != null) return forward.eventId
        return lookup(timestamp, SearchDirection.backward)?.eventId
    }

    /** Why a jump was refused, to pick the notice */
    enum class Failure { Unsupported, Other }

    fun failureOf(error: Throwable): Failure = when ((error as? WizardError)?.code) {
        "unsupportedByServer" -> Failure.Unsupported
        else -> Failure.Other
    }

    /** The notice (locale key) for a failure */
    fun noticeKey(failure: Failure): String = when (failure) {
        Failure.Unsupported -> "room.jumpToDate.unsupported"
        Failure.Other -> "room.jumpToDate.failed"
    }

    /** Runs [lookup] for the day, mapping a refusal to a notice key; returns the event id or throws [JumpRefused] */
    suspend fun find(
        day: LocalDate,
        zone: ZoneId = ZoneId.systemDefault(),
        lookup: suspend (Long, SearchDirection) -> TimestampEvent?,
    ): String? = try {
        eventNear(startOfDay(day, zone), lookup)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw JumpRefused(noticeKey(failureOf(e)), e)
    }

    /** A jump the UI should report with [noticeKey] rather than a raw error */
    class JumpRefused(val noticeKey: String, cause: Throwable? = null) : Exception(cause)
}
