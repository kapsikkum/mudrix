package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.wizardchat.core.PublicRoom
import org.wizardchat.core.WizardClient

/** Pages through a server's public room directory */
class ExploreModel(private val client: WizardClient, private val scope: CoroutineScope) {
    var rooms by mutableStateOf(listOf<PublicRoom>())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var isAtEnd by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private var server: String? = null
    private var filter = ""
    private var next: String? = null
    private var searchJob: Job? = null

    fun load(server: String?, filter: String?) {
        this.server = server
        this.filter = filter?.trim() ?: ""
        next = null
        rooms = emptyList()
        isAtEnd = false
        fetch()
    }

    fun loadNextPage() {
        if (isLoading || isAtEnd) return
        fetch()
    }

    private fun fetch() {
        searchJob?.cancel()
        isLoading = true
        error = null
        searchJob = scope.launch {
            try {
                val page = client.publicRoomsPage(filter, server, null, 30, next)
                val known = rooms.map { it.id }.toSet()
                rooms = rooms + page.rooms.filter { it.id !in known }
                next = page.next
                isAtEnd = page.next == null
                isLoading = false
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (e: Exception) {
                error = e.message ?: e.toString()
                isLoading = false
            }
        }
    }
}
