package de.koblenzerpuppenspiele.techniker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import java.io.ByteArrayOutputStream
import kotlin.math.min

object ScreenFrameBus {
    val jpegFrames = MutableSharedFlow<ByteArray>(
        replay = 0,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
}

/** Captures a user-approved screen/app share and emits about one JPEG frame per second. */
class ScreenCaptureService : Service() {
    companion object {
        const val ACTION_START = "de.koblenzerpuppenspiele.techniker.START_CAPTURE"
        const val ACTION_STOP = "de.koblenzerpuppenspiele.techniker.STOP_CAPTURE"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        private const val CHANNEL_ID = "homepage_live_share"
        private const val NOTIFICATION_ID = 4401
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var lastFrameAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopCapture()
            ACTION_START -> startCapture(intent)
        }
        return START_NOT_STICKY
    }

    private fun startCapture(intent: Intent) {
        createNotificationChannel()
        val notification = androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Homepage-Hilfe ist live")
            .setContentText("Bildschirmfreigabe für die KI-Fehleranalyse")
            .setOngoing(true)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= 30) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val resultData = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        } ?: run {
            stopSelf()
            return
        }

        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = manager.getMediaProjection(resultCode, resultData)
        val mediaProjection = projection ?: run {
            stopSelf()
            return
        }

        thread = HandlerThread("kp-screen-capture").also { it.start() }
        handler = Handler(thread!!.looper)
        mediaProjection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() = stopCapture()
        }, handler)

        val metrics = resources.displayMetrics
        val sourceWidth = metrics.widthPixels.coerceAtLeast(1)
        val sourceHeight = metrics.heightPixels.coerceAtLeast(1)
        val width = min(768, sourceWidth)
        val height = ((sourceHeight.toDouble() / sourceWidth.toDouble()) * width)
            .toInt()
            .coerceIn(320, 1365)

        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2).also { imageReader ->
            imageReader.setOnImageAvailableListener({ source ->
                val now = System.currentTimeMillis()
                val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    if (now - lastFrameAt < 900L) return@setOnImageAvailableListener
                    lastFrameAt = now
                    val plane = image.planes.firstOrNull() ?: return@setOnImageAvailableListener
                    val pixelStride = plane.pixelStride
                    val rowStride = plane.rowStride
                    val rowPadding = rowStride - pixelStride * width
                    val paddedWidth = width + rowPadding / pixelStride
                    val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
                    padded.copyPixelsFromBuffer(plane.buffer)
                    val cropped = Bitmap.createBitmap(padded, 0, 0, width, height)
                    val output = ByteArrayOutputStream()
                    cropped.compress(Bitmap.CompressFormat.JPEG, 76, output)
                    ScreenFrameBus.jpegFrames.tryEmit(output.toByteArray())
                    cropped.recycle()
                    padded.recycle()
                } finally {
                    image.close()
                }
            }, handler)
        }

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "KoblenzerPuppenspieleLive",
            width,
            height,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader!!.surface,
            null,
            handler,
        )
    }

    private fun stopCapture() {
        virtualDisplay?.release()
        virtualDisplay = null
        reader?.close()
        reader = null
        projection?.stop()
        projection = null
        thread?.quitSafely()
        thread = null
        handler = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "KI-Bildschirmfreigabe",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
    }

    override fun onDestroy() {
        virtualDisplay?.release()
        reader?.close()
        projection?.stop()
        thread?.quitSafely()
        super.onDestroy()
    }
}
