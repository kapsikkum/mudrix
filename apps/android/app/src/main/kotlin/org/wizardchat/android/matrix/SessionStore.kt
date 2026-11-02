package org.wizardchat.android.matrix

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.CoreJson
import org.wizardchat.core.Session
import org.wizardchat.core.StoreConfig

@Serializable
data class StoredSession(
    val session: Session,
    val storeFolder: String,
    val passphrase: String,
) {
    val store: StoreConfig
        get() = StoreConfig(location = SessionStore.storePath(storeFolder).path, passphrase = passphrase)

    companion object {
        fun newStore(): Pair<String, StoreConfig> {
            val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val folder = UUID.randomUUID().toString()
            val path = SessionStore.storePath(folder).apply { mkdirs() }
            return folder to StoreConfig(location = path.path, passphrase = Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
    }
}

/** The signed-in session, encrypted with a key that never leaves the Android keystore */
object SessionStore {
    private const val KEY_ALIAS = "org.wizardchat.session"
    private val file: File get() = File(WizardApplication.instance.filesDir, "session.bin")

    fun load(): StoredSession? = runCatching {
        val bytes = file.takeIf { it.exists() }?.readBytes() ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        val json = cipher.doFinal(bytes, 12, bytes.size - 12).decodeToString()
        CoreJson.decodeFromString(StoredSession.serializer(), json)
    }.getOrNull()

    fun save(stored: StoredSession) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.doFinal(CoreJson.encodeToString(StoredSession.serializer(), stored).encodeToByteArray())
        val tmp = File(file.path + ".tmp")
        tmp.writeBytes(cipher.iv + sealed)
        tmp.renameTo(file)
    }

    fun clear() {
        file.delete()
    }

    fun storePath(folder: String): File = File(WizardApplication.instance.filesDir, "accounts/$folder")

    fun removeStore(folder: String) {
        storePath(folder).deleteRecursively()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
