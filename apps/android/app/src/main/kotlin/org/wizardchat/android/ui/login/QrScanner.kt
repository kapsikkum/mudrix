package org.wizardchat.android.ui.login

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import org.wizardchat.android.matrix.QrLogin
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The camera, reading QR codes; `onScan` gets the bytes of the first one it sees */
@Composable
internal fun QrScannerView(onScan: (ByteArray) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = it
        denied = !it
    }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }
    val current by rememberUpdatedState(onScan)

    Box(modifier, contentAlignment = Alignment.Center) {
        if (granted) {
            AndroidView(
                factory = { QrCameraView(it) { bytes -> current(bytes) } },
                modifier = Modifier.matchParentSize(),
                onRelease = { it.close() },
            )
        } else if (denied) {
            Text(
                tr("auth.qr.cameraDenied"),
                Modifier.padding(WZ.Space.space6),
                style = wizardFont(WZ.FontSize.md),
                color = theme.textOnAccent,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** A camera preview that looks for QR codes in the frames (Camera2, so no extra library) */
@SuppressLint("MissingPermission")
private class QrCameraView(context: Context, private val onScan: (ByteArray) -> Unit) :
    FrameLayout(context), TextureView.SurfaceTextureListener {
    private val texture = TextureView(context)
    private val thread = HandlerThread("qr-camera").apply { start() }
    private val handler = Handler(thread.looper)
    private val main = Handler(Looper.getMainLooper())
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var previewWidth = 0
    private var previewHeight = 0

    @Volatile
    private var closed = false

    @Volatile
    private var found = false

    init {
        setBackgroundColor(0xFF000000.toInt())
        clipChildren = true
        addView(texture, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))
        texture.surfaceTextureListener = this
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        fit()
    }

    /** Fills the view with the picture, cropping what does not fit; the sensor's picture is landscape, the screen upright */
    private fun fit() {
        if (previewWidth == 0 || width == 0 || height == 0) return
        val portrait = context.resources.configuration.orientation != android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val contentWidth = if (portrait) previewHeight else previewWidth
        val contentHeight = if (portrait) previewWidth else previewHeight
        val scale = maxOf(width.toFloat() / contentWidth, height.toFloat() / contentHeight)
        val params = texture.layoutParams as LayoutParams
        val w = (contentWidth * scale).toInt()
        val h = (contentHeight * scale).toInt()
        if (params.width != w || params.height != h) {
            params.width = w
            params.height = h
            texture.layoutParams = params
        }
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) = open(surface)

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        close()
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

    private fun open(surface: SurfaceTexture) {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = manager.cameraIdList.firstOrNull {
            manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: manager.cameraIdList.firstOrNull() ?: return
        val map = manager.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: return
        // 1280x720 or the biggest below it: sharp enough for a QR code, light enough to decode every frame
        val size = map.getOutputSizes(ImageFormat.YUV_420_888)
            .filter { it.width <= 1280 && it.height <= 960 }
            .maxByOrNull { it.width * it.height } ?: return
        previewWidth = size.width
        previewHeight = size.height
        main.post { fit() }
        surface.setDefaultBufferSize(size.width, size.height)

        val images = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 2)
        reader = images
        images.setOnImageAvailableListener({ source ->
            val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                if (found || closed) return@setOnImageAvailableListener
                val plane = image.planes[0]
                val rowStride = plane.rowStride
                val luma = ByteArray(rowStride * image.height)
                plane.buffer.get(luma, 0, minOf(luma.size, plane.buffer.remaining()))
                val bytes = QrLogin.scan(luma, image.width, image.height, rowStride) ?: return@setOnImageAvailableListener
                found = true
                main.post { if (!closed) onScan(bytes) }
            } finally {
                image.close()
            }
        }, handler)

        manager.openCamera(id, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                if (closed) {
                    camera.close()
                    return
                }
                device = camera
                val preview = Surface(surface)
                @Suppress("DEPRECATION")
                camera.createCaptureSession(
                    listOf(preview, images.surface),
                    object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(captured: CameraCaptureSession) {
                            if (closed) return
                            session = captured
                            val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                addTarget(preview)
                                addTarget(images.surface)
                                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                            }
                            runCatching { captured.setRepeatingRequest(request.build(), null, handler) }
                        }

                        override fun onConfigureFailed(captured: CameraCaptureSession) {}
                    },
                    handler,
                )
            }

            override fun onDisconnected(camera: CameraDevice) = camera.close()

            override fun onError(camera: CameraDevice, error: Int) = camera.close()
        }, handler)
    }

    fun close() {
        if (closed) return
        closed = true
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        session = null
        device = null
        reader = null
        thread.quitSafely()
    }

    override fun onDetachedFromWindow() {
        close()
        super.onDetachedFromWindow()
    }
}
