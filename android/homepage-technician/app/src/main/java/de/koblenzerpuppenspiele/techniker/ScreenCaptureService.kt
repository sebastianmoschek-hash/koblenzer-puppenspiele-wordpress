package de.koblenzerpuppenspiele.techniker

import android.app.Notification
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
import android.os.IBinder
import android.os.SystemClock
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicLong

/**
 * Keeps one low-rate screenshot of the currently shared Android display.
 *
 * Nothing is uploaded by this service. Frames stay in the app cache and are
 * consumed locally by LiteRT-LM when the user speaks or sends a message.
 */
class ScreenCaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var lastSavedAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Homepage-Hilfe · Live lokal")
            .setContentText("Bildschirmfreigabe läuft nur für die lokale KI")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Int.MIN_VALUE) ?: Int.MIN_VALUE
        val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra(EXTRA_RESULT_DATA) as? Intent
        }
        if (resultCode == Int.MIN_VALUE || resultData == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        startProjection(resultCode, resultData)
        return START_NOT_STICKY
    }

    private fun startProjection(resultCode: Int, resultData: Intent) {
        if (projection != null) return
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val active = manager.getMediaProjection(resultCode, resultData) ?: run {
            stopSelf()
            return
        }
        projection = active
        active.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopSelf()
            }
        }, null)

        val metrics = resources.displayMetrics
        val sourceWidth = metrics.widthPixels.coerceAtLeast(1)
        val sourceHeight = metrics.heightPixels.coerceAtLeast(1)
        imageReader = ImageReader.newInstance(sourceWidth, sourceHeight, PixelFormat.RGBA_8888, 2).also { reader ->
            reader.setOnImageAvailableListener({ available ->
                val image = available.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    val now = SystemClock.elapsedRealtime()
                    if (now - lastSavedAt < FRAME_INTERVAL_MS) return@setOnImageAvailableListener
                    lastSavedAt = now
                    val plane = image.planes.firstOrNull() ?: return@setOnImageAvailableListener
                    val pixelStride = plane.pixelStride
                    val rowStride = plane.rowStride
                    val rowPadding = (rowStride - pixelStride * sourceWidth).coerceAtLeast(0)
                    val paddedWidth = sourceWidth + rowPadding / pixelStride.coerceAtLeast(1)
                    val padded = Bitmap.createBitmap(paddedWidth, sourceHeight, Bitmap.Config.ARGB_8888)
                    padded.copyPixelsFromBuffer(plane.buffer)
                    val cropped = Bitmap.createBitmap(padded, 0, 0, sourceWidth, sourceHeight)
                    if (cropped !== padded) padded.recycle()
                    saveScaledFrame(cropped)
                    cropped.recycle()
                } catch (_: Throwable) {
                    // A missed frame is harmless; the previous local frame remains available.
                } finally {
                    image.close()
                }
            }, null)
        }

        virtualDisplay = active.createVirtualDisplay(
            "KPLocalLiveScreen",
            sourceWidth,
            sourceHeight,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface,
            null,
            null,
        )
        running = true
    }

    private fun saveScaledFrame(source: Bitmap) {
        val maxSide = maxOf(source.width, source.height)
        val scale = if (maxSide > MAX_FRAME_SIDE) MAX_FRAME_SIDE.toFloat() / maxSide.toFloat() else 1f
        val target = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                source,
                (source.width * scale).toInt().coerceAtLeast(1),
                (source.height * scale).toInt().coerceAtLeast(1),
                true,
            )
        } else source
        val dir = File(cacheDir, "local-live-screen").apply { mkdirs() }
        val tmp = File(dir, "latest.tmp.jpg")
        val final = File(dir, "latest.jpg")
        FileOutputStream(tmp).use { output ->
            target.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
            output.fd.sync()
        }
        if (final.exists()) final.delete()
        if (!tmp.renameTo(final)) {
            tmp.copyTo(final, overwrite = true)
            tmp.delete()
        }
        latestPath = final.absolutePath
        latestTimestamp.set(System.currentTimeMillis())
        if (target !== source) target.recycle()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Live lokale Bildschirmfreigabe",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
    }

    override fun onDestroy() {
        running = false
        runCatching { virtualDisplay?.release() }
        virtualDisplay = null
        runCatching { imageReader?.close() }
        imageReader = null
        runCatching { projection?.stop() }
        projection = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "kp-local-live-screen"
        private const val NOTIFICATION_ID = 8401
        private const val EXTRA_RESULT_CODE = "result_code"
        private const val EXTRA_RESULT_DATA = "result_data"
        private const val ACTION_STOP = "de.koblenzerpuppenspiele.techniker.STOP_SCREEN_CAPTURE"
        private const val FRAME_INTERVAL_MS = 900L
        private const val MAX_FRAME_SIDE = 768
        private const val JPEG_QUALITY = 76

        @Volatile private var latestPath: String = ""
        private val latestTimestamp = AtomicLong(0L)
        @Volatile var running: Boolean = false
            private set

        fun start(context: Context, resultCode: Int, resultData: Intent) {
            val intent = Intent(context, ScreenCaptureService::class.java)
                .putExtra(EXTRA_RESULT_CODE, resultCode)
                .putExtra(EXTRA_RESULT_DATA, resultData)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, ScreenCaptureService::class.java).setAction(ACTION_STOP))
        }

        fun latestFrame(maxAgeMs: Long = 6_000L): File? {
            val path = latestPath
            if (path.isBlank()) return null
            if (System.currentTimeMillis() - latestTimestamp.get() > maxAgeMs) return null
            return File(path).takeIf { it.isFile && it.length() > 0 }
        }
    }
}
