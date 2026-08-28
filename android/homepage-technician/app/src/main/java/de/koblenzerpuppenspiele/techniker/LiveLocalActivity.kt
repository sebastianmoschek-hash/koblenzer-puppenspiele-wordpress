package de.koblenzerpuppenspiele.techniker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
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

/**
 * Thin native shell for the installable web app's free local live mode.
 *
 * The UI remains the web app. Android only contributes capabilities a mobile
 * browser cannot provide reliably: MediaProjection screen capture, explicit
 * on-device speech recognition/TTS and local multimodal LiteRT-LM inference.
 */
class LiveLocalActivity : Activity() {
    companion object {
        private const val REQ_AUDIO = 711
        private const val REQ_SCREEN = 712
    }

    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var webView: WebView
    private lateinit var repairBridge: WebRepairBridge
    private lateinit var localAi: LocalAiTechnician
    private lateinit var visualAi: LocalVisualAgent
    private lateinit var voiceController: LocalVoiceController

    @Volatile private var currentPageTrusted = false
    private var liveActive = false
    private var pendingStart = false
    private var busy = false
    private var queuedVoice = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        configureWebView()

        repairBridge = WebRepairBridge(webView)
        webView.addJavascriptInterface(repairBridge, "KPRepairResult")
        webView.addJavascriptInterface(LocalLiveBridge(), "KPLocalLive")
        localAi = LocalAiTechnician(
            context = this,
            bridge = repairBridge,
            confirm = ::confirmAction,
            status = { dispatchStatus(it) },
        )
        visualAi = LocalVisualAgent(this) { dispatchStatus(it) }
        voiceController = LocalVoiceController(
            context = this,
            onUserText = { text -> runOnUiThread { handleVoiceText(text) } },
            onStatus = { dispatchStatus(it) },
        )
        loadRequestedUrl(intent)
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
            userAgentString = userAgentString + " KoblenzerPuppenspieleLocalLive/1.0"
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
                if (currentPageTrusted) installWebHook()
                dispatch(
                    "bridge-ready",
                    JSONObject()
                        .put("available", currentPageTrusted)
                        .put("modelInstalled", ::visualAi.isInitialized && visualAi.modelInstalled())
                        .put("live", liveActive),
                )
            }
        }
    }

    /**
     * The server-delivered web app remains unchanged. This tiny bridge layer is
     * injected only inside the native local-live shell and wires its existing
     * chat composer to the Android on-device runtime.
     */
    private fun installWebHook() {
        val script = """
            (() => {
              if (window.__kpLocalLiveHook) return;
              window.__kpLocalLiveHook = true;
              const STORE = 'kp-owner-web-agent-chat-v1';
              let live = false;
              let modelInstalled = false;
              try { live = !!window.KPLocalLive.isLive(); } catch (_) {}
              try { modelInstalled = !!window.KPLocalLive.isModelInstalled(); } catch (_) {}
              const q = s => document.querySelector(s);
              const save = (role, text) => {
                try {
                  const rows = JSON.parse(sessionStorage.getItem(STORE) || '[]');
                  const list = Array.isArray(rows) ? rows : [];
                  list.push({role, text: String(text || ''), at: Date.now()});
                  sessionStorage.setItem(STORE, JSON.stringify(list.slice(-24)));
                } catch (_) {}
              };
              const append = (role, text) => {
                const list = q('.kp-wa-messages');
                if (!list) return;
                const article = document.createElement('article');
                article.className = 'kp-wa-msg is-' + role;
                const who = document.createElement('b');
                who.textContent = role === 'user' ? 'Du' : 'KI';
                const body = document.createElement('div');
                body.textContent = String(text || '');
                article.append(who, body);
                list.appendChild(article);
                list.scrollTop = list.scrollHeight;
                save(role, text);
              };
              const status = text => { const el = q('.kp-wa-status'); if (el) el.textContent = String(text || ''); };
              const buttonState = () => {
                const b = q('.kp-wa-local-live');
                if (!b) return;
                b.textContent = live ? '■ Live lokal' : (modelInstalled ? '◉ Live lokal' : '⬇ Gemma lokal');
                b.setAttribute('aria-pressed', live ? 'true' : 'false');
              };
              const install = () => {
                const actions = q('.kp-wa-compose-actions');
                if (!actions || q('.kp-wa-local-live')) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'kp-wa-local-live';
                b.style.minHeight = '48px';
                b.style.borderRadius = '14px';
                b.style.padding = '8px 12px';
                b.style.fontWeight = '800';
                b.style.border = '1px solid rgba(255,255,255,.18)';
                b.style.background = 'rgba(255,255,255,.09)';
                b.style.color = 'inherit';
                b.addEventListener('click', event => {
                  event.preventDefault(); event.stopPropagation();
                  if (live) { window.KPLocalLive.stop(); return; }
                  if (!modelInstalled) { status('Lokales Gemma-Modell wird installiert …'); window.KPLocalLive.installModel(); return; }
                  window.KPLocalLive.start();
                });
                const speedButton = document.createElement('button');
                speedButton.type = 'button';
                speedButton.className = 'kp-wa-local-speed';
                speedButton.style.minHeight = '48px';
                speedButton.style.borderRadius = '14px';
                speedButton.style.padding = '8px 12px';
                speedButton.style.fontWeight = '800';
                speedButton.style.border = '1px solid rgba(255,255,255,.18)';
                speedButton.style.background = 'rgba(255,255,255,.09)';
                speedButton.style.color = 'inherit';
                const refreshSpeed = () => {
                  try { speedButton.textContent = '🔊 Thorsten High · ' + window.KPLocalLive.speechRateLabel(); }
                  catch (_) { speedButton.textContent = '🔊 Thorsten High · 1,0×'; }
                };
                speedButton.addEventListener('click', event => {
                  event.preventDefault(); event.stopPropagation();
                  try { speedButton.textContent = '🔊 Thorsten High · ' + window.KPLocalLive.cycleSpeechRate(); }
                  catch (_) {}
                });
                refreshSpeed();
                actions.prepend(speedButton);
                actions.prepend(b);
                const small = q('.kp-wa-head small');
                if (small) small.textContent = 'Live lokal · Bildschirm + Sprache + Gemma auf dem Gerät';
                buttonState();
              };
              const sendLocal = text => {
                const clean = String(text || '').trim();
                if (!clean) return;
                const id = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
                append('user', clean);
                status('Live lokal · Gemma betrachtet den aktuellen Bildschirm …');
                window.KPLocalLive.ask(id, clean);
              };
              document.addEventListener('click', event => {
                if (!live || !event.target.closest('.kp-wa-send')) return;
                const input = q('.kp-wa-input');
                const text = String(input && input.value || '').trim();
                if (!text) return;
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                input.value = '';
                sendLocal(text);
              }, true);
              document.addEventListener('keydown', event => {
                if (!live || event.key !== 'Enter' || event.shiftKey || !event.target.matches('.kp-wa-input')) return;
                const text = String(event.target.value || '').trim();
                if (!text) return;
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                event.target.value = '';
                sendLocal(text);
              }, true);
              window.addEventListener('kp:local-live', event => {
                const d = event.detail || {};
                if (d.type === 'bridge-ready') {
                  modelInstalled = !!d.modelInstalled; live = !!d.live; buttonState(); return;
                }
                if (d.type === 'state') {
                  live = !!d.live; buttonState(); status(d.message || (live ? 'Live lokal aktiv' : 'Bereit')); return;
                }
                if (d.type === 'model-progress') { status('Gemma lokal wird installiert · ' + Number(d.percent || 0) + ' %'); return; }
                if (d.type === 'model') {
                  modelInstalled = !!d.installed; buttonState(); status(d.message || 'Lokales Modell bereit');
                  if (modelInstalled && !live) setTimeout(() => window.KPLocalLive.start(), 250);
                  return;
                }
                if (d.type === 'needs-model') { modelInstalled = false; buttonState(); status(d.message || 'Lokales Modell fehlt'); return; }
                if (d.type === 'status' || d.type === 'working') { status(d.message || 'Live lokal arbeitet …'); return; }
                if (d.type === 'user') { append('user', d.text || ''); return; }
                if (d.type === 'reply') { append('assistant', d.text || ''); status('Live lokal · ich höre weiter zu'); return; }
                if (d.type === 'error') { append('assistant', 'Live lokal: ' + (d.message || 'Unbekannter Fehler')); status('Live lokal · Fehler'); }
              });
              install();
              const timer = setInterval(() => { install(); if (!document.documentElement.isConnected) clearInterval(timer); }, 600);
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun loadRequestedUrl(intent: Intent?) {
        val deepLink = intent?.data
        val requested = if (deepLink?.scheme == "koblenzerpuppenspiele" && deepLink.host == "vision") {
            deepLink.getQueryParameter("url")
        } else null
        val uri = requested?.let { runCatching { Uri.parse(it) }.getOrNull() }
        val base = if (uri != null && uri.scheme == "https" && isTrustedHost(uri.host)) uri else Uri.parse(BuildConfig.HOMEPAGE_URL)
        val url = base.buildUpon()
            .appendQueryParameter("kp_edit", "1")
            .appendQueryParameter("kp_ai", "1")
            .build()
            .toString()
        currentPageTrusted = false
        webView.loadUrl(url)
    }

    private fun startLocalLive() {
        if (!currentPageTrusted) {
            dispatchError("Live lokal ist nur auf der Koblenzer-Puppenspiele-Web-App verfügbar.")
            return
        }
        if (!visualAi.modelInstalled()) {
            dispatch("needs-model", JSONObject().put("message", "Das lokale Gemma-Modell muss einmalig installiert werden (~2,6 GB)."))
            return
        }
        if (!voiceController.isSupported()) {
            dispatchError("Auf diesem Gerät ist keine ausdrücklich lokale Android-Spracherkennung verfügbar. Bildschirm + Textchat können trotzdem lokal verwendet werden.")
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingStart = true
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }
        requestScreenPermission()
    }

    private fun requestScreenPermission() {
        pendingStart = true
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), REQ_SCREEN)
        dispatchStatus("Live lokal · Android fragt einmal nach Bildschirmfreigabe …")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SCREEN) return
        pendingStart = false
        if (resultCode != RESULT_OK || data == null) {
            dispatchError("Bildschirmfreigabe wurde nicht bestätigt. Live lokal bleibt aus.")
            return
        }
        ScreenCaptureService.start(this, resultCode, data)
        liveActive = true
        queuedVoice = ""
        if (voiceController.isSupported()) {
            runCatching { voiceController.start() }
                .onFailure { dispatchError(it.message ?: "Lokale Sprache konnte nicht gestartet werden.") }
        }
        dispatch(
            "state",
            JSONObject()
                .put("live", true)
                .put("screen", true)
                .put("voice", voiceController.isSupported())
                .put("message", "Live lokal aktiv · Bildschirm und Sprache bleiben auf dem Gerät."),
        )
        dispatchStatus("Live lokal · ich höre zu und sehe deinen aktuellen Bildschirm")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_AUDIO) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            requestScreenPermission()
        } else {
            pendingStart = false
            dispatchError("Mikrofonzugriff wurde nicht erlaubt. Du kannst Live lokal später erneut starten.")
        }
    }

    private fun stopLocalLive() {
        pendingStart = false
        liveActive = false
        queuedVoice = ""
        runCatching { voiceController.stop() }
        runCatching { visualAi.release() }
        ScreenCaptureService.stop(this)
        dispatch("state", JSONObject().put("live", false).put("message", "Live lokal beendet."))
        dispatchStatus("Live lokal beendet · Web-App bleibt geöffnet")
    }

    private fun handleVoiceText(text: String) {
        if (!liveActive || text.isBlank()) return
        if (busy) {
            queuedVoice = (queuedVoice + " " + text.trim()).trim().take(900)
            voiceController.stopSpeakingForBargeIn()
            dispatchStatus("Live lokal · Nachtrag verstanden · kommt direkt als Nächstes")
            return
        }
        val id = "voice-${System.currentTimeMillis()}"
        dispatch("user", JSONObject().put("id", id).put("text", text).put("voice", true))
        processLocalRequest(id, text, speakReply = true)
    }

    private fun processLocalRequest(requestId: String, text: String, speakReply: Boolean) {
        if (!liveActive) {
            dispatch("error", JSONObject().put("id", requestId).put("message", "Bitte zuerst Live lokal starten."))
            return
        }
        if (busy) {
            dispatch("error", JSONObject().put("id", requestId).put("message", "Die lokale KI verarbeitet gerade noch die vorherige Nachricht."))
            return
        }
        busy = true
        dispatch("working", JSONObject().put("id", requestId).put("message", "Gemma betrachtet den aktuellen Bildschirm …"))
        uiScope.launch {
            try {
                var frame = ScreenCaptureService.latestFrame()
                if (frame == null) {
                    delay(1_050L)
                    frame = ScreenCaptureService.latestFrame()
                }
                val actualFrame = frame ?: throw IllegalStateException("Der erste Bildschirm-Frame ist noch nicht bereit. Bitte in einer Sekunde erneut senden.")
                val page = runCatching { repairBridge.context().toString() }.getOrDefault("{}")
                val visual = visualAi.analyze(text, actualFrame, page)

                var finalReply = visual.reply
                if (visual.handoff.isNotBlank()) {
                    dispatch(
                        "working",
                        JSONObject()
                            .put("id", requestId)
                            .put("message", "Ich habe den sichtbaren Auftrag erkannt und gebe ihn jetzt an den lokalen Editor-/Code-Agenten weiter …"),
                    )
                    // Only one large LiteRT-LM engine should stay resident on a phone.
                    visualAi.release()
                    val execution = localAi.send(visual.handoff)
                    localAi.release()
                    finalReply = listOf(visual.reply, execution).filter { it.isNotBlank() }.joinToString("\n\n")
                }

                dispatch("reply", JSONObject().put("id", requestId).put("text", finalReply).put("local", true))
                if (speakReply && liveActive && queuedVoice.isBlank()) voiceController.speak(finalReply)
            } catch (error: Throwable) {
                dispatch(
                    "error",
                    JSONObject()
                        .put("id", requestId)
                        .put("message", error.message ?: error.javaClass.simpleName),
                )
            } finally {
                busy = false
                if (liveActive) {
                    val queued = queuedVoice.trim()
                    if (queued.isNotBlank()) {
                        queuedVoice = ""
                        handleVoiceText(queued)
                    } else if (voiceController.isSupported()) {
                        voiceController.continueListening(120L)
                    }
                }
            }
        }
    }

    private fun installModel() {
        if (busy || visualAi.modelInstalled()) {
            dispatch("model", JSONObject().put("installed", visualAi.modelInstalled()))
            return
        }
        busy = true
        uiScope.launch {
            try {
                localAi.downloadModel { downloaded, total ->
                    val percent = if (total > 0) ((downloaded * 100L) / total).toInt().coerceIn(0, 100) else 0
                    dispatch("model-progress", JSONObject().put("percent", percent).put("downloaded", downloaded).put("total", total))
                }
                dispatch("model", JSONObject().put("installed", true).put("message", "Lokales Gemma-Modell ist installiert."))
            } catch (error: Throwable) {
                dispatchError(error.message ?: "Lokales Modell konnte nicht installiert werden.")
            } finally {
                busy = false
            }
        }
    }

    private fun dispatchStatus(text: String) {
        dispatch("status", JSONObject().put("message", text))
    }

    private fun dispatchError(text: String) {
        dispatch("error", JSONObject().put("message", text))
    }

    private fun dispatch(type: String, data: JSONObject) {
        if (!::webView.isInitialized) return
        data.put("type", type)
        runOnUiThread {
            if (!currentPageTrusted) return@runOnUiThread
            val json = data.toString()
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('kp:local-live',{detail:$json}));",
                null,
            )
        }
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

    private fun isTrustedHost(host: String?): Boolean {
        val value = host?.lowercase().orEmpty()
        return value == "koblenzer-puppenspiele.de" || value.endsWith(".koblenzer-puppenspiele.de")
    }

    private inner class LocalLiveBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = currentPageTrusted

        @JavascriptInterface
        fun isModelInstalled(): Boolean = ::visualAi.isInitialized && visualAi.modelInstalled()

        @JavascriptInterface
        fun isLive(): Boolean = liveActive

        @JavascriptInterface
        fun start() {
            if (!currentPageTrusted) return
            runOnUiThread { if (!liveActive && !pendingStart) startLocalLive() }
        }

        @JavascriptInterface
        fun stop() {
            if (!currentPageTrusted) return
            runOnUiThread { if (liveActive || pendingStart) stopLocalLive() }
        }

        @JavascriptInterface
        fun ask(requestId: String, text: String) {
            if (!currentPageTrusted) return
            val cleanId = requestId.take(80)
            val cleanText = text.trim().take(2200)
            if (cleanText.isBlank()) return
            runOnUiThread { processLocalRequest(cleanId, cleanText, speakReply = false) }
        }

        @JavascriptInterface
        fun speechRateLabel(): String = if (::voiceController.isInitialized) voiceController.speechRateLabel() else "1,0×"

        @JavascriptInterface
        fun cycleSpeechRate(): String = if (::voiceController.isInitialized) voiceController.cycleSpeechRateLabel() else "1,0×"

        @JavascriptInterface
        fun installModel() {
            if (!currentPageTrusted) return
            runOnUiThread { this@LiveLocalActivity.installModel() }
        }
    }

    override fun onDestroy() {
        if (liveActive || ScreenCaptureService.running) ScreenCaptureService.stop(this)
        if (::voiceController.isInitialized) voiceController.release()
        if (::visualAi.isInitialized) visualAi.release()
        if (::localAi.isInitialized) localAi.release()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("KPRepairResult")
            webView.removeJavascriptInterface("KPLocalLive")
            webView.destroy()
        }
        uiScope.cancel()
        super.onDestroy()
    }
}
