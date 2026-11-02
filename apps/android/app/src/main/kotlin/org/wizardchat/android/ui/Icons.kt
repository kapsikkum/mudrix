package org.wizardchat.android.ui

import android.annotation.SuppressLint
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import java.util.concurrent.ConcurrentHashMap
import org.wizardchat.android.WizardApplication
import org.wizardchat.tokens.WZ

/** Phosphor icon weights, as in packages/icons */
enum class PhWeight { thin, light, regular, bold, fill, duotone }

object PhIcons {
    private val ids = ConcurrentHashMap<String, Int>()

    /** `ph_<name>_<weight>` from packages/icons (0 if it isn't in the set); `name` is kebab-case (`chat-circle`) */
    @SuppressLint("DiscouragedApi")
    fun id(name: String, weight: PhWeight = PhWeight.regular): Int {
        val key = "ph_${name.replace('-', '_')}_${weight.name}"
        return ids.getOrPut(key) {
            val context = WizardApplication.instance
            context.resources.getIdentifier(key, "drawable", context.packageName).also {
                if (it == 0) android.util.Log.w("WizardChat", "No icon $key: add it to packages/icons/src/icons.json")
            }
        }
    }
}

/** A Phosphor icon */
@Composable
fun PhIcon(
    name: String,
    weight: PhWeight = PhWeight.regular,
    size: Dp = WZ.SizeIcon.md,
    tint: Color = LocalContentColor.current,
    contentDescription: String? = null,
    modifier: Modifier = Modifier,
) {
    val id = PhIcons.id(name, weight)
    if (id == 0) {
        androidx.compose.foundation.layout.Box(modifier.size(size))
        return
    }
    Icon(
        painter = painterResource(id),
        contentDescription = contentDescription,
        tint = tint,
        modifier = modifier.size(size),
    )
}
