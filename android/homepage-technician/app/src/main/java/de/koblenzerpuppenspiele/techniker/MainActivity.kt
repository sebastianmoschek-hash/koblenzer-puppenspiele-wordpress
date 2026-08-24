package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
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
import android.widget.Toast
import androidx.core.content.ContextCompat
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
 * The AI opens as a real full-height chat window above the persistent editor bar.
 * Android resizes the chat around the software keyboard, so the composer and the
 * latest answer remain visible while typing. The same local model powers an
 * interruptible conversational Live mode. No Gemini/OpenAI API is required;
 * emergency Gemini remains an explicit optional handoff.
 */
class MainActivity : Activity() {
    companion object {
        private const val REQ_AUDIO = 601
    }

    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private lateinit var editButton: Button
    private lateinit var aiButton: Button

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

    private var aiOpen = false
    private var liveLocal = false
    private var busy = false
    private var lastRequest = ""
    private var queuedLiveRequest = ""
    @Volatile private var currentPageTrusted = false

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
        voiceController = LocalVoiceController(
            context = this,
            onUserText = { text -> runOnUiThread { handleVoiceText(text) } },
            onStatus = ::showStatus,
        )

        editButton.setOnClickListener { openEditor() }
        aiButton.setOnClickListener { toggleAi() }
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
            text = "Notfall Gemini"
            isAllCaps = false
            contentDescription = "Aktuelle Aufgabe für die normale Gemini-App vorbereiten"
        }
        aiPanel.addView(emergencyButton)

        root.addView(
            aiPanel,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply {
                bottomMargin = dp(72)
            }
        )

        val bar = LinearLayout(this).apply {
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
        bar.addView(statusView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(editButton)
        bar.addView(aiButton)

        root.addView(
            bar,
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
                if (!aiOpen && currentPageTrusted) {
                    showStatus(
                        if (signedIn) "Homepage bereit · Bearbeiten oder KI verwenden"
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
        showStatus("Lokale KI · Chat bereit")
        textInput.requestFocus()
        transcriptScroll.post { transcriptScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun hideAi() {
        if (liveLocal) stopLocalLive(silent = true)
        aiOpen = false
        aiPanel.visibility = View.GONE
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
            textInput.isEnabled = false
            sendButton.isEnabled = false
        }

        liveVoiceButton.text = if (liveLocal) "■ Live beenden" else "🎤 Live lokal"
        liveVoiceButton.isEnabled = liveLocal || (state.installed && !busy && voiceSupported)
        voiceSelectButton.text = if (::voiceController.isInitialized) "🔊 ${voiceController.selectedVoiceLabel()}" else "🔊 Stimme"
        voiceSelectButton.isEnabled = !busy && ::voiceController.isInitialized && voiceController.hasOfflineGermanVoices()
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
            showStatus("Die lokale KI arbeitet noch · deine nächste Nachricht kann gleich danach gesendet werden")
            return
        }
        val message = textInput.text?.toString()?.trim().orEmpty()
        if (message.isBlank()) return
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
                val reply = localAi.send(clean)
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
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }

        liveLocal = true
        queuedLiveRequest = ""
        addChatBubble(
            "System",
            "Live lokal gestartet. Sprich frei; deine erkannten Sätze erscheinen hier im Chat. Du kannst der KI ins Wort fallen. Audio wird nicht an Gemini/OpenAI gesendet.",
            false,
        )
        runCatching { voiceController.start() }
            .onFailure {
                liveLocal = false
                addChatBubble("System", it.message ?: "Live lokal konnte nicht gestartet werden.", false)
            }
        refreshModelState()
    }

    private fun stopLocalLive(silent: Boolean = false) {
        queuedLiveRequest = ""
        voiceController.stop()
        liveLocal = false
        if (!silent) addChatBubble("System", "Live lokal beendet. Der normale KI-Chat bleibt geöffnet.", false)
        refreshModelState()
        showStatus("Lokale KI · Chat bereit")
    }

    private fun showVoicePicker() {
        val options = voiceController.voiceOptions()
        if (options.isEmpty()) {
            addChatBubble("System", "Auf diesem Gerät ist derzeit keine deutsche Offline-Stimme installiert. Weitere Stimmen lassen sich in den Android-TTS-Einstellungen installieren.", false)
            showStatus("Keine deutsche Offline-Stimme gefunden")
            return
        }

        val selectedId = voiceController.selectedVoiceId()
        val labels = options.map { option ->
            if (option.id == selectedId) "✓ ${option.label}" else option.label
        }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Lokale Stimme auswählen")
            .setMessage("Tippe eine Stimme an. Sie wird sofort lokal vorgespielt und gespeichert.")
            .setItems(labels) { dialog, which ->
                val option = options[which]
                if (voiceController.previewVoice(option.id)) {
                    addChatBubble("System", "${option.label} ausgewählt. Die Vorschau läuft lokal.", false)
                    showStatus("${option.label} ausgewählt")
                } else {
                    showStatus("Diese lokale Stimme konnte nicht gestartet werden.")
                }
                dialog.dismiss()
                refreshModelState()
            }
            .setNegativeButton("Schließen", null)
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_AUDIO) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startLocalLive()
        } else {
            addChatBubble("System", "Ohne Mikrofonberechtigung bleibt Live lokal aus. Schreiben funktioniert weiterhin.", false)
            showStatus("Mikrofonzugriff abgelehnt · Chat bleibt verfügbar")
        }
    }

    private fun openEmergencyGemini() {
        if (busy) return
        val request = textInput.text?.toString()?.trim().orEmpty().ifBlank { lastRequest }
        if (request.isBlank()) {
            addChatBubble("System", "Schreib oder sprich zuerst die Aufgabe. Dann kann ich sie für Gemini vorbereiten.", false)
            return
        }
        if (liveLocal) stopLocalLive(silent = true)

        busy = true
        refreshModelState()
        uiScope.launch {
            try {
                showStatus("Notfall Gemini · Kontext wird vorbereitet …")
                val prompt = localAi.emergencyPrompt(request)
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Homepage-Aufgabe für Gemini", prompt))
                addChatBubble("System", "Aufgabe samt Seitenkontext wurde kopiert. In Gemini nur noch Einfügen drücken.", false)
                Toast.makeText(this@MainActivity, "Gemini-Aufgabe kopiert", Toast.LENGTH_LONG).show()
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://gemini.google.com/app")))
                showStatus("Notfall Gemini geöffnet · Aufgabe ist in der Zwischenablage")
            } catch (error: Throwable) {
                addChatBubble("System", "Gemini konnte nicht geöffnet werden: ${error.message ?: error.javaClass.simpleName}", false)
            } finally {
                busy = false
                refreshModelState()
            }
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
