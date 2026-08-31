package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
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
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume
import android.media.projection.MediaProjectionManager

/**
 * Homepage-Hilfe has two primary paths:
 * 1) manual visual editing and 2) a free on-device AI chat.
 *
 * The AI opens as a real full-height chat window above the persistent editor bar.
 * Android resizes the chat around the software keyboard, so the composer and the
 * latest answer remain visible while typing. The same local model powers an
 * interruptible conversational Live mode. Gemini is only an explicit protected
 * server-side emergency fallback and never needs credentials inside Android.
 */
class MainActivity : Activity() {
    companion object {
        private const val REQ_AUDIO = 601
        private const val REQ_SCREEN_CAPTURE = 602
    }

    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private lateinit var editButton: Button
    private lateinit var aiButton: Button
    private lateinit var logoutButton: Button
    private lateinit var bottomBar: LinearLayout

    private lateinit var aiPanel: LinearLayout
    private lateinit var chatProgress: TextView
    private lateinit var modelInfo: TextView
    private lateinit var installButton: Button
    private lateinit var transcriptScroll: ScrollView
    private lateinit var messageList: LinearLayout
    private lateinit var textInput: EditText
    private lateinit var sendButton: Button
    private lateinit var liveVoiceButton: Button
    private lateinit var voiceSelectButton: Button
    private lateinit var emergencyButton: Button

    private lateinit var repairBridge: WebRepairBridge
    private lateinit var localAi: LocalAiTechnician
    private lateinit var voiceController: LocalVoiceController
    private lateinit var visualAi: LocalVisualAgent

    private var aiOpen = false
    private var liveLocal = false
    private var liveScreenActive = false
    private var busy = false
    private var lastRequest = ""
    private var queuedLiveRequest = ""
    private val emergencyHistory = mutableListOf<Pair<String, String>>()
    @Volatile private var currentPageTrusted = false
    private var pendingScreenAfterAudio = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
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
        visualAi = LocalVisualAgent(this) { statusText -> runOnUiThread { showStatus(statusText) } }
        voiceController = LocalVoiceController(
            context = this,
            onUserText = { text -> runOnUiThread { handleVoiceText(text) } },
            onStatus = ::showStatus,
        )

        editButton.setOnClickListener { openEditor() }
        aiButton.setOnClickListener { toggleAi() }
        logoutButton.setOnClickListener { logoutOfWordPress() }
        installButton.setOnClickListener { installLocalModel() }
        sendButton.setOnClickListener { sendLocalMessage() }
        liveVoiceButton.setOnClickListener { toggleLocalLive() }
        voiceSelectButton.setOnClickListener { showVoicePicker() }
        emergencyButton.setOnClickListener { openEmergencyGemini() }
        textInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendLocalMessage()
                true
            } else {
                false
            }
        }
        textInput.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) transcriptScroll.post { transcriptScroll.fullScroll(View.FOCUS_DOWN) }
        }

        loadInitialUrl(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::webView.isInitialized) loadInitialUrl(intent)
    }

    private fun buildUi() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        webView = WebView(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        )

        aiPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setBackgroundColor(Color.rgb(22, 18, 16))
            visibility = View.GONE
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val headerText = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val title = TextView(this).apply {
            text = "Lokale KI"
            setTextColor(Color.WHITE)
            textSize = 21f
        }
        modelInfo = TextView(this).apply {
            text = "Lokales Modell wird geprüft …"
            setTextColor(Color.rgb(205, 205, 205))
            textSize = 12f
            maxLines = 2
        }
        headerText.addView(title)
        headerText.addView(modelInfo)
        header.addView(headerText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        val closeChat = Button(this).apply {
            text = "✕"
            isAllCaps = false
            contentDescription = "KI-Chat schließen"
            setOnClickListener { hideAi() }
        }
        header.addView(closeChat, LinearLayout.LayoutParams(dp(56), LinearLayout.LayoutParams.WRAP_CONTENT))
        aiPanel.addView(header)

        chatProgress = TextView(this).apply {
            text = "Bereit · schreibe, was geändert werden soll"
            setTextColor(Color.rgb(240, 156, 79))
            textSize = 12f
            maxLines = 2
            setPadding(dp(2), dp(6), dp(2), dp(6))
        }
        aiPanel.addView(chatProgress)

        installButton = Button(this).apply {
            text = "Lokale KI installieren (~2,6 GB)"
            isAllCaps = false
        }
        aiPanel.addView(installButton)

        messageList = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(2), dp(6), dp(2), dp(8))
        }
        transcriptScroll = ScrollView(this).apply {
            isFillViewport = true
            addView(
                messageList,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                )
            )
        }
        aiPanel.addView(
            transcriptScroll,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        )

        addChatBubble(
            who = "KI",
            text = "Hallo. Schreib mir einfach, was an der Homepage oder App geändert werden soll. Ich zeige dir hier immer, was ich verstanden habe und was ich gerade mache.",
            user = false,
        )

        val composer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            setPadding(0, dp(6), 0, dp(4))
        }
        textInput = EditText(this).apply {
            hint = "Nachricht an die lokale KI …"
            setHintTextColor(Color.rgb(155, 155, 155))
            setTextColor(Color.WHITE)
            textSize = 16f
            minLines = 1
            maxLines = 4
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_SEND
            setPadding(dp(12), dp(10), dp(12), dp(10))
            isEnabled = false
            background = GradientDrawable().apply {
                setColor(Color.rgb(38, 33, 30))
                cornerRadius = dp(14).toFloat()
                setStroke(dp(1), Color.rgb(95, 83, 75))
            }
        }
        sendButton = Button(this).apply {
            text = "Senden"
            isAllCaps = false
            isEnabled = false
        }
        composer.addView(
            textInput,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(8)
            }
        )
        composer.addView(sendButton)
        aiPanel.addView(composer)

        val voiceRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        liveVoiceButton = Button(this).apply {
            text = "🎤 Live lokal"
            isAllCaps = false
            isEnabled = false
            contentDescription = "Natürliches lokales Gespräch starten"
        }
        voiceSelectButton = Button(this).apply {
            text = "🔊 Stimme"
            isAllCaps = false
            isEnabled = false
            contentDescription = "Deutsche Offline-Stimme auswählen"
        }
        voiceRow.addView(liveVoiceButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        voiceRow.addView(voiceSelectButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        aiPanel.addView(voiceRow)

        emergencyButton = Button(this).apply {
            text = "Notfall Gemini (Cloud)"
            isAllCaps = false
            contentDescription = "Gemini als geschützten Cloud-Notfallassistenten im Chat verwenden"
        }
        aiPanel.addView(emergencyButton)

        root.addView(
            aiPanel,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        )

        bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(7), dp(10), dp(7))
            setBackgroundColor(Color.argb(248, 24, 18, 15))
            gravity = Gravity.CENTER_VERTICAL
        }
        statusView = TextView(this).apply {
            text = "Homepage bereit"
            setTextColor(Color.WHITE)
            textSize = 12f
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
        logoutButton = Button(this).apply {
            text = "⎋ Logout"
            isAllCaps = false
            contentDescription = "Von der Homepage abmelden"
        }
        bottomBar.addView(statusView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        bottomBar.addView(editButton)
        bottomBar.addView(aiButton)
        bottomBar.addView(logoutButton)

        root.addView(
            bottomBar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            )
        )

        setContentView(root)
    }

    private fun addChatBubble(who: String, text: String, user: Boolean): TextView {
        val bubble = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 15f
            setPadding(dp(12), dp(9), dp(12), dp(9))
            maxWidth = (resources.displayMetrics.widthPixels * 0.88f).toInt()
            this.text = "$who\n${text.trim()}"
            background = GradientDrawable().apply {
                setColor(if (user) Color.rgb(79, 62, 49) else Color.rgb(45, 39, 35))
                cornerRadius = dp(15).toFloat()
                setStroke(dp(1), if (user) Color.rgb(166, 104, 54) else Color.rgb(76, 68, 63))
            }
        }
        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = if (user) Gravity.END else Gravity.START
            topMargin = dp(5)
            bottomMargin = dp(5)
            marginStart = if (user) dp(42) else 0
            marginEnd = if (user) 0 else dp(42)
        }
        messageList.addView(bubble, params)
        transcriptScroll.post { transcriptScroll.fullScroll(View.FOCUS_DOWN) }
        return bubble
    }

    private fun removeChatBubble(view: TextView?) {
        if (view == null) return
        runOnUiThread {
            if (view.parent === messageList) messageList.removeView(view)
        }
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
            userAgentString = userAgentString + " KoblenzerPuppenspieleTechnician/0.6-chatwindow"
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
                logoutButton.visibility = if (signedIn) View.VISIBLE else View.GONE
                val isEditing = url?.contains("kp_edit=1") == true
                // In active edit mode, hide native bottomBar so web edit toolbars have exclusive screen space
                bottomBar.visibility = if (signedIn && isEditing && !aiOpen) View.GONE else View.VISIBLE
                if (!aiOpen && currentPageTrusted) {
                    showStatus(
                        if (signedIn) "Homepage bereit · Bearbeiten oder KI verwenden"
                        else "Bitte anmelden · danach stehen Bearbeiten und KI bereit"
                    )
                }
            }
        }
    }

    private fun logoutOfWordPress() {
        if (aiOpen) hideAi()
        val uri = runCatching { Uri.parse(BuildConfig.HOMEPAGE_URL) }.getOrNull() ?: return
        val origin = "${uri.scheme}://${uri.authority}/"
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        webView.clearCache(true)
        webView.loadUrl(origin)
        showStatus("Abgemeldet · bei Bedarf erneut anmelden")
    }

    private fun loadInitialUrl(intent: Intent?) {
        val deepLink = intent?.data
        val requested = if (deepLink?.scheme == "koblenzerpuppenspiele" && deepLink.host == "live") {
            deepLink.getQueryParameter("url")
        } else null
        val uri = requested?.let { runCatching { Uri.parse(it) }.getOrNull() }
        val base = Uri.parse(BuildConfig.HOMEPAGE_URL)
        val defaultUrl = if (hasWordPressSession()) {
            BuildConfig.HOMEPAGE_URL
        } else {
            base.buildUpon().clearQuery().path("/").build().toString()
        }
        val url = if (uri != null && uri.scheme == "https" && isTrustedHost(uri.host)) uri.toString() else defaultUrl
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
        aiOpen = true
        bottomBar.visibility = View.GONE
        aiPanel.visibility = View.VISIBLE
        aiPanel.bringToFront()
        aiButton.text = "✕ KI"
        refreshModelState()
        showStatus("Lokale KI · Chat bereit")
        textInput.requestFocus()
        transcriptScroll.post { transcriptScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun hideAi() {
        if (liveLocal) stopLocalLive(silent = true)
        aiOpen = false
        aiPanel.visibility = View.GONE
        val signedIn = hasWordPressSession()
        val isEditing = webView.url?.contains("kp_edit=1") == true
        bottomBar.visibility = if (signedIn && isEditing) View.GONE else View.VISIBLE
        aiButton.text = "✦ KI"
        val keyboard = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        keyboard.hideSoftInputFromWindow(textInput.windowToken, 0)
        showStatus("Homepage bereit · Bearbeiten oder KI verwenden")
    }

    private fun refreshModelState() {
        val state = localAi.modelState()
        val freeGb = state.freeBytes / 1_000_000_000.0
        val ramGb = state.totalRamBytes / 1_000_000_000.0
        val voiceSupported = ::voiceController.isInitialized && voiceController.isSupported()

        if (state.installed) {
            modelInfo.text = buildString {
                append("Lokal · ${"%.1f".format(state.modelBytes / 1_000_000_000.0)} GB Modell · ${"%.1f".format(freeGb)} GB frei")
                if (!state.recommendedRam) append(" · ${"%.1f".format(ramGb)} GB RAM")
            }
            installButton.visibility = View.GONE
            textInput.isEnabled = !busy
            sendButton.isEnabled = !busy
        } else {
            modelInfo.text = buildString {
                append("Einmaliger Download ca. 2,6 GB · ${"%.1f".format(freeGb)} GB frei")
                if (!state.arm64) append(" · Gerät nicht ARM64-kompatibel")
            }
            installButton.visibility = View.VISIBLE
            installButton.isEnabled = !busy && state.arm64
            // Writing a task must stay possible before the 2.6 GB model is installed.
            // The draft remains in the composer until the model is available.
            textInput.isEnabled = !busy
            sendButton.isEnabled = !busy
        }

        liveVoiceButton.text = if (liveLocal) "■ Live beenden" else "🎤 Live lokal"
        liveVoiceButton.isEnabled = liveLocal || (state.installed && !busy && voiceSupported)
        voiceSelectButton.text = if (::voiceController.isInitialized) "🔊 ${voiceController.naturalVoiceLabel()}" else "🔊 Stimme"
        voiceSelectButton.isEnabled = !busy && ::voiceController.isInitialized
        emergencyButton.isEnabled = !busy
    }

    private fun installLocalModel() {
        if (busy) return
        busy = true
        refreshModelState()
        addChatBubble("System", "Das lokale Modell wird einmalig heruntergeladen. Danach läuft der normale Chat ohne KI-API-Kosten.", false)
        uiScope.launch {
            try {
                localAi.downloadModel { downloaded, total ->
                    val pct = if (total > 0) ((downloaded * 100) / total).coerceIn(0, 100) else 0
                    showStatus("Lokale KI wird geladen · $pct %")
                }
                addChatBubble("System", "Lokale KI ist installiert und bereit.", false)
                showStatus("Lokale KI bereit · kostenlos auf dem Gerät")
            } catch (error: Throwable) {
                addChatBubble("System", error.message ?: "Modell konnte nicht installiert werden.", false)
                showStatus("Lokale KI: ${error.message ?: error.javaClass.simpleName}")
            } finally {
                busy = false
                refreshModelState()
            }
        }
    }

    private fun sendLocalMessage() {
        if (busy) {
            showStatus("Die KI arbeitet noch · deine nächste Nachricht kann gleich danach gesendet werden")
            return
        }
        val message = textInput.text?.toString()?.trim().orEmpty()
        if (message.isBlank()) return

        if (!localAi.modelState().installed) {
            // Wenn das lokale 2.6-GB-Modell noch nicht heruntergeladen ist,
            // leiten wir die Anfrage automatisch an den schnellen Cloud-Fallback weiter,
            // damit die KI immer sofort antwortet.
            lastRequest = message
            textInput.text?.clear()
            openEmergencyGemini()
            return
        }
        textInput.text?.clear()
        processLocalRequest(message, if (liveLocal) "Du (Chat)" else "Du", speakReply = liveLocal)
    }

    private fun handleVoiceText(message: String) {
        if (!liveLocal || message.isBlank()) return
        if (busy) {
            queuedLiveRequest = (queuedLiveRequest + " " + message.trim()).trim().take(800)
            voiceController.stopSpeakingForBargeIn()
            showStatus("Live lokal · Nachtrag verstanden · kommt direkt als Nächstes")
            voiceController.continueListening(140L)
            return
        }
        processLocalRequest(message, "Du (Live)", speakReply = true)
    }

    private fun processLocalRequest(message: String, who: String, speakReply: Boolean) {
        if (busy) return
        if (!localAi.modelState().installed) {
            showStatus("Bitte zuerst die lokale KI installieren.")
            return
        }

        val clean = message.trim()
        lastRequest = clean
        addChatBubble(who, clean, true)
        val thinking = addChatBubble(
            "KI",
            "Verstanden: „${clean.take(220)}“\nIch lese die aktuelle Seite und prüfe jetzt, welche Änderung sicher ausgeführt werden kann …",
            false,
        )

        busy = true
        refreshModelState()
        showStatus("Lokale KI denkt und prüft die Seite …")
        if (liveLocal) voiceController.continueListening(160L)

        uiScope.launch {
            try {
                val reply = runCatching {
                    if (liveScreenActive && ScreenCaptureService.running) {
                        val frame = ScreenCaptureService.latestFrame(maxAgeMs = 10_000L)
                        if (frame != null && visualAi.modelInstalled()) {
                            val pageContext = runCatching { webView.url ?: "" }.getOrDefault("")
                            visualAi.analyze(clean, frame, pageContext).reply
                        } else {
                            localAi.send(clean)
                        }
                    } else {
                        localAi.send(clean)
                    }
                }.getOrElse { error ->
                    if (liveScreenActive && error.message?.contains("Modell", ignoreCase = true) == true) {
                        localAi.send(clean)
                    } else {
                        throw error
                    }
                }
                removeChatBubble(thinking)
                addChatBubble("KI", reply, false)
                showStatus("Lokale KI bereit")
                if (speakReply && liveLocal && queuedLiveRequest.isBlank()) {
                    voiceController.speak(reply)
                } else if (liveLocal && queuedLiveRequest.isNotBlank()) {
                    showStatus("Live lokal · Unterbrechung berücksichtigt · dein Nachtrag kommt jetzt")
                }
            } catch (error: Throwable) {
                removeChatBubble(thinking)
                val errorText = error.message ?: error.javaClass.simpleName
                addChatBubble(
                    "KI",
                    "Ich konnte den lokalen Modellaufruf gerade nicht abschließen.\n\n$errorText",
                    false,
                )
                showStatus("Lokale KI: $errorText")
                if (liveLocal && queuedLiveRequest.isBlank()) {
                    voiceController.speak("Der lokale Modellaufruf ist fehlgeschlagen. Die genaue Meldung steht im Chat.")
                }
            } finally {
                busy = false
                refreshModelState()
                if (liveLocal) {
                    val queued = queuedLiveRequest.trim()
                    if (queued.isNotBlank()) {
                        queuedLiveRequest = ""
                        processLocalRequest(queued, "Du (Live)", speakReply = true)
                    } else {
                        voiceController.continueListening(100L)
                    }
                }
            }
        }
    }

    private fun toggleLocalLive() {
        if (liveLocal) stopLocalLive() else startLocalLive()
    }

    private fun startLocalLive() {
        if (!localAi.modelState().installed) {
            showStatus("Bitte zuerst die lokale KI installieren.")
            return
        }
        if (!voiceController.isSupported()) {
            addChatBubble("System", "Dieses Android-Gerät bietet keine lokale On-Device-Spracherkennung. Der Textchat bleibt vollständig nutzbar.", false)
            showStatus("Live lokal nicht verfügbar · Chat funktioniert weiterhin")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingScreenAfterAudio = true
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }
        requestScreenPermission()
    }

    private fun requestScreenPermission() {
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), REQ_SCREEN_CAPTURE)
        showStatus("Live lokal · einmalig Bildschirmfreigabe bestätigen …")
    }

    private fun afterScreenPermissionGranted() {
        liveLocal = true
        liveScreenActive = true
        queuedLiveRequest = ""
        addChatBubble(
            "System",
            "Live lokal gestartet · ich sehe deinen Bildschirm und höre zu. Sprich frei, falle mir gerne ins Wort. Bild & Audio bleiben auf deinem Gerät.",
            false,
        )
        runCatching { voiceController.start() }
            .onFailure {
                liveLocal = false
                addChatBubble("System", it.message ?: "Live lokal konnte nicht gestartet werden.", false)
            }
        refreshModelState()
        showStatus("Live lokal · ich sehe deinen Bildschirm und höre zu")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SCREEN_CAPTURE) return
        if (resultCode == RESULT_OK && data != null) {
            ScreenCaptureService.start(this, resultCode, data)
            afterScreenPermissionGranted()
        } else {
            liveLocal = false
            addChatBubble("System", "Bildschirmfreigabe wurde nicht bestätigt. Live lokal bleibt aus.", false)
            showStatus("Live lokal nicht gestartet · Chat bleibt geöffnet")
        }
    }

    private fun stopLocalLive(silent: Boolean = false) {
        queuedLiveRequest = ""
        if (::voiceController.isInitialized) runCatching { voiceController.stop() }
        if (::visualAi.isInitialized) runCatching { visualAi.release() }
        if (ScreenCaptureService.running) ScreenCaptureService.stop(this)
        liveLocal = false
        liveScreenActive = false
        if (!silent) addChatBubble("System", "Live lokal beendet. Der normale KI-Chat bleibt geöffnet.", false)
        refreshModelState()
        showStatus("Lokale KI · Chat bereit")
    }



    private fun showVoicePicker() {
        val label = if (::voiceController.isInitialized) voiceController.naturalVoiceLabel() else "Thorsten (lokal)"
        addChatBubble("System", "Aktive Stimme: $label. Sie läuft vollständig lokal auf diesem Gerät (kein Internet, keine Kosten).", false)
        showStatus("$label aktiv")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_AUDIO) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            if (pendingScreenAfterAudio) {
                pendingScreenAfterAudio = false
                requestScreenPermission()
            } else {
                startLocalLive()
            }
        } else {
            addChatBubble("System", "Ohne Mikrofonberechtigung bleibt Live lokal aus. Schreiben funktioniert weiterhin.", false)
            showStatus("Mikrofonzugriff abgelehnt · Chat bleibt verfügbar")
        }
    }

    private fun openEmergencyGemini() {
        if (busy) return
        val request = textInput.text?.toString()?.trim().orEmpty().ifBlank { lastRequest }
        if (request.isBlank()) {
            addChatBubble("System", "Schreib zuerst deine Aufgabe. Notfall Gemini antwortet dann direkt hier im Chat und kann bei Bedarf einen geprüften Code-Fix vorbereiten.", false)
            return
        }
        if (liveLocal) stopLocalLive(silent = true)

        val clean = request.trim()
        textInput.text?.clear()
        lastRequest = clean
        addChatBubble("Du (Notfall)", clean, true)
        val thinking = addChatBubble(
            "Gemini (Notfall)",
            "Ich arbeite über den geschützten Server. Ich prüfe zuerst, ob wir nur sprechen/planen oder ob wirklich ein Code-Patch nötig ist …",
            false,
        )
        busy = true
        refreshModelState()

        uiScope.launch {
            try {
                showStatus("Notfall Gemini · geschützter Cloud-Fallback arbeitet …")
                val raw = repairBridge.emergencyGemini(clean, emergencyHistoryText())
                val result = JSONObject(raw.toString())
                result.optString("error").takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }

                val reply = result.optString("reply").trim().ifBlank {
                    "Ich bin als Notfall-Gemini verbunden. Beschreibe mir die Aufgabe bitte noch etwas genauer."
                }
                removeChatBubble(thinking)
                addChatBubble("Gemini (Notfall)", reply, false)
                emergencyHistory += clean to reply
                while (emergencyHistory.size > 6) emergencyHistory.removeAt(0)

                val proposalId = result.optString("proposal_id").trim()
                if (proposalId.isBlank()) {
                    showStatus("Notfall Gemini · Antwort im Chat")
                    return@launch
                }

                val summary = result.optString("summary").ifBlank { "Notfall-Gemini-Reparatur" }
                val diagnosis = result.optString("diagnosis")
                val risk = result.optString("risk").ifBlank { "medium" }
                val create = confirmAction(
                    "Gemini-Prüfbranch erstellen?",
                    "$summary\n\n${diagnosis.take(1200)}\n\nRisiko: $risk\n\nGemini hat nur einen Vorschlag vorbereitet. Der Code wird nicht direkt auf die Homepage oder App geschrieben; zuerst entsteht ein isolierter GitHub-Prüfbranch mit CI.",
                )
                if (!create) {
                    addChatBubble("System", "Geminis Code-Vorschlag wurde nicht als Prüfbranch angelegt.", false)
                    showStatus("Notfall Gemini · Vorschlag nicht ausgeführt")
                    return@launch
                }

                showStatus("Notfall Gemini · Prüfbranch und CI werden erstellt …")
                val prRaw = repairBridge.createEmergencyGeminiBranch(proposalId)
                val pr = JSONObject(prRaw.toString())
                pr.optString("error").takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }
                val number = pr.optString("pr").trim()
                val url = pr.optString("url").trim()
                if (number.isBlank()) throw IllegalStateException("GitHub hat keine PR-Nummer für den Gemini-Fix geliefert.")
                addChatBubble(
                    "System",
                    buildString {
                        append("Notfall-Gemini-Fix als Prüfbranch angelegt (PR #$number). CI prüft den Code jetzt automatisch.")
                        if (url.isNotBlank()) append("\n$url")
                    },
                    false,
                )

                when (waitForEmergencyCi(number)) {
                    "success" -> {
                        val mergeApproved = confirmAction(
                            "CI grün – Gemini-Fix übernehmen?",
                            "PR #$number ist grün. Soll der geprüfte Notfall-Gemini-Fix jetzt per Squash-Merge übernommen werden?",
                        )
                        if (mergeApproved) {
                            showStatus("Notfall Gemini · grüner Fix wird übernommen …")
                            val mergeRaw = repairBridge.merge(number)
                            val merge = JSONObject(mergeRaw.toString())
                            merge.optString("error").takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }
                            addChatBubble(
                                "System",
                                merge.optString("message").ifBlank { "Der grüne Notfall-Gemini-Fix wurde übernommen." },
                                false,
                            )
                            showStatus("Notfall Gemini · geprüfter Fix übernommen")
                        } else {
                            addChatBubble("System", "CI ist grün, aber du hast den Merge nicht bestätigt. Der Fix bleibt im Prüfbranch.", false)
                            showStatus("Notfall Gemini · grüner Prüfbranch bleibt offen")
                        }
                    }
                    "failure" -> {
                        val diagnosticsRaw = repairBridge.localRepairCiDiagnostics(number)
                        val diagnosticsObj = JSONObject(diagnosticsRaw.toString())
                        val diagnostics = diagnosticsObj.optString("diagnostics").trim().take(3500)
                        val failure = buildString {
                            append("CI für PR #$number ist rot. Nichts wurde übernommen.")
                            if (diagnostics.isNotBlank()) append("\n\nBereinigte Diagnose:\n$diagnostics")
                            append("\n\nSchreib mir mit „Notfall Gemini“ weiter, dann können wir den Fehler gemeinsam korrigieren.")
                        }
                        addChatBubble("Gemini (Notfall)", failure, false)
                        emergencyHistory += "CI-Ergebnis PR #$number" to failure
                        while (emergencyHistory.size > 6) emergencyHistory.removeAt(0)
                        showStatus("Notfall Gemini · CI rot · nichts übernommen")
                    }
                    else -> {
                        addChatBubble(
                            "System",
                            "CI für PR #$number läuft länger. Es wurde nichts übernommen; der Prüfbranch bleibt offen und kann später erneut geprüft werden.",
                            false,
                        )
                        showStatus("Notfall Gemini · CI läuft weiter")
                    }
                }
            } catch (error: Throwable) {
                removeChatBubble(thinking)
                val errorText = error.message ?: error.javaClass.simpleName
                addChatBubble(
                    "Gemini (Notfall)",
                    "Der geschützte Notfall-Gemini-Aufruf ist fehlgeschlagen.\n\n$errorText",
                    false,
                )
                showStatus("Notfall Gemini: $errorText")
            } finally {
                busy = false
                refreshModelState()
            }
        }
    }

    private fun emergencyHistoryText(): String = emergencyHistory
        .takeLast(4)
        .joinToString("\n\n") { (user, assistant) ->
            "NUTZER: ${user.take(800)}\nGEMINI: ${assistant.take(1200)}"
        }
        .takeLast(6000)

    private suspend fun waitForEmergencyCi(pr: String): String {
        repeat(24) { attempt ->
            val raw = repairBridge.status(pr)
            val status = JSONObject(raw.toString())
            status.optString("error").takeIf { it.isNotBlank() }?.let { throw IllegalStateException(it) }
            when (val health = status.optString("health")) {
                "success", "failure" -> return health
            }
            showStatus("Notfall Gemini · CI läuft … ${attempt + 1}/24")
            if (attempt < 23) delay(5_000L)
        }
        return "pending"
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
        runOnUiThread {
            if (::statusView.isInitialized) statusView.text = text
            if (::chatProgress.isInitialized && aiOpen) chatProgress.text = text
        }
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
        if (::voiceController.isInitialized) voiceController.release()
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
