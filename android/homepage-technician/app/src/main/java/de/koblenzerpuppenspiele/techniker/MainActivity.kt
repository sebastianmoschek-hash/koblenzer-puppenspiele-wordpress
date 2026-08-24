package de.koblenzerpuppenspiele.techniker

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Homepage-Hilfe has two primary paths:
 * 1) manual visual editing and 2) a free on-device AI chat.
 *
 * The local model never needs a Gemini/OpenAI API key. Difficult tasks can be
 * copied to the normal Gemini consumer app through the explicit emergency button.
 */
class MainActivity : Activity() {
    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private lateinit var editButton: Button
    private lateinit var aiButton: Button
    private lateinit var aiPanel: LinearLayout
    private lateinit var modelInfo: TextView
    private lateinit var installButton: Button
    private lateinit var transcript: TextView
    private lateinit var transcriptScroll: ScrollView
    private lateinit var textInput: EditText
    private lateinit var sendButton: Button
    private lateinit var emergencyButton: Button
    private lateinit var repairBridge: WebRepairBridge
    private lateinit var localAi: LocalAiTechnician
    private var aiOpen = false
    private var busy = false
    private var lastRequest = ""
    @Volatile private var currentPageTrusted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        configureWebView()

        repairBridge = WebRepairBridge(webView)
        webView.addJavascriptInterface(repairBridge, "KPRepairResult")
        webView.addJavascriptInterface(NativeAiBridge(), "KPAndroidTechnician")
        localAi = LocalAiTechnician(
            context = this,
            bridge = repairBridge,
            confirm = ::confirmAction,
            status = ::showStatus,
        )

        editButton.setOnClickListener { openEditor() }
        aiButton.setOnClickListener { toggleAi() }
        installButton.setOnClickListener { installLocalModel() }
        sendButton.setOnClickListener { sendLocalMessage() }
        emergencyButton.setOnClickListener { openEmergencyGemini() }
        textInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendLocalMessage()
                true
            } else false
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

        val bottom = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        aiPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setBackgroundColor(Color.argb(248, 24, 18, 15))
            visibility = View.GONE
        }

        modelInfo = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 13f
            text = "Lokale KI wird geprüft …"
            setPadding(dp(4), 0, dp(4), dp(4))
        }
        aiPanel.addView(modelInfo)

        installButton = Button(this).apply {
            text = "Lokale KI installieren (~2,6 GB)"
            isAllCaps = false
        }
        aiPanel.addView(installButton)

        transcript = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 14f
            setPadding(dp(8), dp(8), dp(8), dp(8))
            text = "Lokale KI: Schreib einfach, was an der Homepage geändert werden soll."
        }
        transcriptScroll = ScrollView(this).apply {
            addView(transcript)
            isFillViewport = true
        }
        aiPanel.addView(
            transcriptScroll,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(180)),
        )

        val composer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        textInput = EditText(this).apply {
            hint = "Änderungswunsch schreiben …"
            setHintTextColor(Color.rgb(175, 175, 175))
            setTextColor(Color.WHITE)
            setSingleLine(true)
            imeOptions = EditorInfo.IME_ACTION_SEND
            textSize = 15f
            setPadding(dp(12), dp(8), dp(12), dp(8))
            isEnabled = false
        }
        sendButton = Button(this).apply {
            text = "Senden"
            isAllCaps = false
            isEnabled = false
        }
        composer.addView(textInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        composer.addView(sendButton)
        aiPanel.addView(composer)

        emergencyButton = Button(this).apply {
            text = "Notfall Gemini"
            isAllCaps = false
            contentDescription = "Aktuelle Aufgabe für die normale Gemini-App vorbereiten"
        }
        aiPanel.addView(emergencyButton)
        bottom.addView(aiPanel)

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setBackgroundColor(Color.argb(236, 24, 18, 15))
            gravity = Gravity.CENTER_VERTICAL
        }
        statusView = TextView(this).apply {
            text = "Homepage bereit"
            setTextColor(Color.WHITE)
            textSize = 13f
            maxLines = 2
        }
        editButton = Button(this).apply {
            text = "✎ Bearbeiten"
            isAllCaps = false
        }
        aiButton = Button(this).apply {
            text = "✦ KI"
            isAllCaps = false
        }
        bar.addView(statusView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(editButton)
        bar.addView(aiButton)
        bottom.addView(bar)

        root.addView(
            bottom,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            )
        )
        setContentView(root)
    }

    private fun configureWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            userAgentString = userAgentString + " KoblenzerPuppenspieleTechnician/0.3-localai"
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (uri.scheme == "https" && isTrustedHost(uri.host)) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val uri = url?.let { runCatching { Uri.parse(it) }.getOrNull() }
                currentPageTrusted = uri?.scheme == "https" && isTrustedHost(uri.host)
                val signedIn = hasWordPressSession()
                editButton.text = if (signedIn) "✎ Bearbeiten" else "✎ Anmelden"
                if (!aiOpen && currentPageTrusted) {
                    showStatus(
                        if (signedIn) "Homepage bereit · Bearbeiten oder kostenlose KI verwenden"
                        else "Bitte anmelden · danach stehen Bearbeiten und KI bereit"
                    )
                }
            }
        }
    }

    private fun loadInitialUrl(intent: Intent?) {
        val deepLink = intent?.data
        val requested = if (deepLink?.scheme == "koblenzerpuppenspiele" && deepLink.host == "live") {
            deepLink.getQueryParameter("url")
        } else null
        val uri = requested?.let { runCatching { Uri.parse(it) }.getOrNull() }
        val url = if (uri != null && uri.scheme == "https" && isTrustedHost(uri.host)) uri.toString() else BuildConfig.HOMEPAGE_URL
        currentPageTrusted = false
        webView.loadUrl(url)
    }

    private fun openEditor() {
        if (hasWordPressSession()) {
            showStatus("Manueller Bearbeitungsmodus wird geöffnet …")
            webView.loadUrl(BuildConfig.HOMEPAGE_URL)
        } else {
            showStatus("Bitte einmal bei WordPress anmelden …")
            webView.loadUrl(editorLoginUrl())
        }
    }

    private fun toggleAi() {
        if (aiOpen) {
            hideAi()
            return
        }
        if (!isTrustedWebPage()) {
            showStatus("KI ist nur auf der Koblenzer-Puppenspiele-Homepage verfügbar.")
            return
        }
        if (!hasWordPressSession()) {
            showStatus("Bitte zuerst anmelden · danach KI erneut öffnen")
            openEditor()
            return
        }
        aiOpen = true
        aiPanel.visibility = View.VISIBLE
        aiButton.text = "✕ KI"
        refreshModelState()
        showStatus("Lokale KI · keine API-Kosten")
    }

    private fun hideAi() {
        aiOpen = false
        aiPanel.visibility = View.GONE
        aiButton.text = "✦ KI"
        val keyboard = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        keyboard.hideSoftInputFromWindow(textInput.windowToken, 0)
        showStatus("Homepage bereit · Bearbeiten oder kostenlose KI verwenden")
    }

    private fun refreshModelState() {
        val state = localAi.modelState()
        val freeGb = state.freeBytes / 1_000_000_000.0
        val ramGb = state.totalRamBytes / 1_000_000_000.0
        if (state.installed) {
            modelInfo.text = buildString {
                append("Lokale KI installiert · ${"%.1f".format(state.modelBytes / 1_000_000_000.0)} GB Modell · ${"%.1f".format(freeGb)} GB frei")
                if (!state.recommendedRam) append(" · RAM ${"%.1f".format(ramGb)} GB: kann langsamer sein")
            }
            installButton.visibility = View.GONE
            textInput.isEnabled = !busy
            sendButton.isEnabled = !busy
        } else {
            modelInfo.text = buildString {
                append("Einmaliger Download: ca. 2,6 GB · frei ${"%.1f".format(freeGb)} GB")
                if (!state.arm64) append(" · dieses Gerät ist nicht ARM64-kompatibel")
                if (!state.recommendedRam) append(" · ${"%.1f".format(ramGb)} GB RAM: Testbetrieb")
            }
            installButton.visibility = View.VISIBLE
            installButton.isEnabled = !busy && state.arm64
            textInput.isEnabled = false
            sendButton.isEnabled = false
        }
        emergencyButton.isEnabled = !busy
    }

    private fun installLocalModel() {
        if (busy) return
        busy = true
        refreshModelState()
        appendTranscript("System", "Das lokale Modell wird einmalig heruntergeladen. Danach läuft der Chat ohne KI-API-Kosten.")
        uiScope.launch {
            try {
                localAi.downloadModel { downloaded, total ->
                    val pct = if (total > 0) ((downloaded * 100) / total).coerceIn(0, 100) else 0
                    showStatus("Lokale KI wird geladen · $pct %")
                }
                appendTranscript("System", "Lokale KI ist installiert und bereit.")
                showStatus("Lokale KI bereit · kostenlos auf dem Gerät")
            } catch (error: Throwable) {
                appendTranscript("System", error.message ?: "Modell konnte nicht installiert werden.")
                showStatus("Lokale KI: ${error.message ?: error.javaClass.simpleName}")
            } finally {
                busy = false
                refreshModelState()
            }
        }
    }

    private fun sendLocalMessage() {
        if (busy) return
        val message = textInput.text?.toString()?.trim().orEmpty()
        if (message.isBlank()) return
        if (!localAi.modelState().installed) {
            showStatus("Bitte zuerst die lokale KI installieren.")
            return
        }
        lastRequest = message
        textInput.text?.clear()
        appendTranscript("Du", message)
        busy = true
        refreshModelState()
        uiScope.launch {
            try {
                val reply = localAi.send(message)
                appendTranscript("KI", reply)
            } catch (error: Throwable) {
                appendTranscript("KI", "Fehler: ${error.message ?: error.javaClass.simpleName}")
                showStatus("Lokale KI: ${error.message ?: error.javaClass.simpleName}")
            } finally {
                busy = false
                refreshModelState()
            }
        }
    }

    private fun openEmergencyGemini() {
        if (busy) return
        val request = textInput.text?.toString()?.trim().orEmpty().ifBlank { lastRequest }
        if (request.isBlank()) {
            appendTranscript("System", "Schreib zuerst die Aufgabe ins Feld. Dann kann ich sie für Gemini vorbereiten.")
            return
        }
        busy = true
        refreshModelState()
        uiScope.launch {
            try {
                showStatus("Notfall Gemini · Kontext wird vorbereitet …")
                val prompt = localAi.emergencyPrompt(request)
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Homepage-Aufgabe für Gemini", prompt))
                appendTranscript("System", "Aufgabe samt Seitenkontext wurde kopiert. In Gemini nur noch Einfügen drücken.")
                Toast.makeText(this@MainActivity, "Gemini-Aufgabe kopiert", Toast.LENGTH_LONG).show()
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://gemini.google.com/app")))
                showStatus("Notfall Gemini geöffnet · Aufgabe ist in der Zwischenablage")
            } catch (error: Throwable) {
                appendTranscript("System", "Gemini konnte nicht geöffnet werden: ${error.message ?: error.javaClass.simpleName}")
            } finally {
                busy = false
                refreshModelState()
            }
        }
    }

    private fun appendTranscript(who: String, text: String) {
        runOnUiThread {
            transcript.append("\n\n$who: ${text.trim()}")
            transcriptScroll.post { transcriptScroll.fullScroll(View.FOCUS_DOWN) }
        }
    }

    private fun hasWordPressSession(): Boolean {
        val uri = runCatching { Uri.parse(BuildConfig.HOMEPAGE_URL) }.getOrNull() ?: return false
        val cookieUrl = "${uri.scheme}://${uri.authority}/"
        val cookies = CookieManager.getInstance().getCookie(cookieUrl).orEmpty()
        return cookies.split(';').any { it.trim().startsWith("wordpress_logged_in_") }
    }

    private fun editorLoginUrl(): String {
        val editor = Uri.parse(BuildConfig.HOMEPAGE_URL)
        return Uri.Builder()
            .scheme(editor.scheme ?: "https")
            .encodedAuthority(editor.authority)
            .path("/wp-login.php")
            .appendQueryParameter("redirect_to", BuildConfig.HOMEPAGE_URL)
            .build()
            .toString()
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

    private fun isTrustedWebPage(): Boolean {
        val uri = runCatching { Uri.parse(webView.url ?: return false) }.getOrNull() ?: return false
        return uri.scheme == "https" && isTrustedHost(uri.host)
    }

    private fun isTrustedHost(host: String?): Boolean {
        val value = host?.lowercase().orEmpty()
        return value == "koblenzer-puppenspiele.de" || value.endsWith(".koblenzer-puppenspiele.de")
    }

    private inner class NativeAiBridge {
        @JavascriptInterface
        fun startLive() {
            if (!currentPageTrusted) return
            runOnUiThread { if (!aiOpen) toggleAi() }
        }

        @JavascriptInterface
        fun stopLive() {
            if (!currentPageTrusted) return
            runOnUiThread { if (aiOpen) hideAi() }
        }

        @JavascriptInterface
        fun isAvailable(): Boolean = currentPageTrusted
    }

    @Deprecated("Legacy back handling keeps minSdk implementation compact")
    override fun onBackPressed() {
        if (aiOpen) hideAi()
        else if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::localAi.isInitialized) localAi.release()
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
