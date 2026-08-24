package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class MainActivity : Activity() {
    companion object {
        private const val REQ_AUDIO = 501
        private const val REQ_SCREEN = 502
    }

    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private lateinit var liveButton: Button
    private lateinit var repairBridge: WebRepairBridge
    private lateinit var technician: GeminiLiveTechnician
    private var live = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        configureWebView()

        repairBridge = WebRepairBridge(webView)
        webView.addJavascriptInterface(repairBridge, "KPRepairResult")
        webView.addJavascriptInterface(NativeLiveBridge(), "KPAndroidTechnician")
        technician = GeminiLiveTechnician(
            context = this,
            bridge = repairBridge,
            confirm = ::confirmAction,
            status = ::showStatus,
        )

        liveButton.setOnClickListener {
            if (live) stopLive() else beginLive()
        }
        loadInitialUrl(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::webView.isInitialized) loadInitialUrl(intent)
    }

    private fun buildUi() {
        val root = FrameLayout(this)
        webView = WebView(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        )

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setBackgroundColor(Color.argb(232, 24, 18, 15))
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        statusView = TextView(this).apply {
            text = "Homepage-Hilfe bereit"
            setTextColor(Color.WHITE)
            textSize = 13f
            maxLines = 2
        }
        liveButton = Button(this).apply {
            text = "✦ KI live zeigen"
            isAllCaps = false
        }
        bar.addView(
            statusView,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        bar.addView(liveButton)
        root.addView(
            bar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                android.view.Gravity.BOTTOM,
            )
        )
        setContentView(root)
    }

    private fun configureWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            userAgentString = userAgentString + " KoblenzerPuppenspieleTechnician/0.1"
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (isTrustedHost(uri.host)) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (!live) showStatus("Homepage bereit · KI kann live zugeschaltet werden")
            }
        }
    }

    private fun loadInitialUrl(intent: Intent?) {
        val deepLink = intent?.data
        val requested = if (deepLink?.scheme == "koblenzerpuppenspiele" && deepLink.host == "live") {
            deepLink.getQueryParameter("url")
        } else null
        val uri = requested?.let { runCatching { Uri.parse(it) }.getOrNull() }
        val url = if (uri != null && uri.scheme == "https" && isTrustedHost(uri.host)) {
            uri.toString()
        } else {
            BuildConfig.HOMEPAGE_URL
        }
        webView.loadUrl(url)
    }

    private fun beginLive() {
        if (!isTrustedWebPage()) {
            showStatus("KI-Live ist nur auf der Koblenzer-Puppenspiele-Homepage verfügbar.")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }
        connectGeminiAndAskForScreen()
    }

    private fun connectGeminiAndAskForScreen() {
        liveButton.isEnabled = false
        uiScope.launch {
            try {
                technician.start()
                val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                @Suppress("DEPRECATION")
                startActivityForResult(manager.createScreenCaptureIntent(), REQ_SCREEN)
            } catch (error: Throwable) {
                technician.stop()
                showStatus(error.message ?: "Gemini Live konnte nicht gestartet werden.")
            } finally {
                liveButton.isEnabled = true
            }
        }
    }

    @Deprecated("Deprecated in Android API; retained for MediaProjection compatibility across minSdk 23+")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SCREEN) return
        if (resultCode != RESULT_OK || data == null) {
            technician.stop()
            showStatus("Bildschirmfreigabe wurde nicht gestartet.")
            return
        }
        val serviceIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_START
            putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
        }
        ContextCompat.startForegroundService(this, serviceIntent)
        live = true
        liveButton.text = "■ Live beenden"
        showStatus("KI live · zeig und beschreibe jetzt den Fehler")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_AUDIO) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            connectGeminiAndAskForScreen()
        } else {
            showStatus("Mikrofonzugriff wird für das Live-Gespräch benötigt.")
        }
    }

    private fun stopLive() {
        runCatching {
            startService(Intent(this, ScreenCaptureService::class.java).apply {
                action = ScreenCaptureService.ACTION_STOP
            })
        }
        technician.stop()
        live = false
        liveButton.text = "✦ KI live zeigen"
        showStatus("KI-Live beendet · Homepage bleibt geöffnet")
    }

    private suspend fun confirmAction(title: String, message: String): Boolean = suspendCancellableCoroutine { cont ->
        runOnUiThread {
            if (isFinishing || isDestroyed) {
                if (cont.isActive) cont.resume(false)
                return@runOnUiThread
            }
            val dialog = AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setNegativeButton("Abbrechen") { _, _ -> if (cont.isActive) cont.resume(false) }
                .setPositiveButton("Bestätigen") { _, _ -> if (cont.isActive) cont.resume(true) }
                .setOnCancelListener { if (cont.isActive) cont.resume(false) }
                .create()
            cont.invokeOnCancellation { dialog.dismiss() }
            dialog.show()
        }
    }

    private fun showStatus(text: String) {
        runOnUiThread { if (::statusView.isInitialized) statusView.text = text }
    }

    private fun isTrustedWebPage(): Boolean = runCatching {
        val uri = Uri.parse(webView.url ?: return false)
        uri.scheme == "https" && isTrustedHost(uri.host)
    }.getOrDefault(false)

    private fun isTrustedHost(host: String?): Boolean {
        val value = host?.lowercase().orEmpty()
        return value == "koblenzer-puppenspiele.de" || value.endsWith(".koblenzer-puppenspiele.de")
    }

    private inner class NativeLiveBridge {
        @JavascriptInterface
        fun startLive() {
            if (!isTrustedWebPage()) return
            runOnUiThread { if (!live) beginLive() }
        }

        @JavascriptInterface
        fun stopLive() {
            if (!isTrustedWebPage()) return
            runOnUiThread { if (live) this@MainActivity.stopLive() }
        }

        @JavascriptInterface
        fun isAvailable(): Boolean = isTrustedWebPage()
    }

    @Deprecated("Legacy back handling keeps minSdk implementation compact")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::technician.isInitialized) technician.release()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("KPRepairResult")
            webView.removeJavascriptInterface("KPAndroidTechnician")
            webView.destroy()
        }
        uiScope.cancel()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
