package de.koblenzerpuppenspiele.studiocloud

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.*
import java.util.UUID

/** Cloud editor shell: no local model, server, API key or production URL. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    @Volatile private var trusted = false
    @Volatile private var bridgeToken = ""
    private var audioRequest: PermissionRequest? = null
    private var chooser: ValueCallback<Array<Uri>>? = null
    private fun allowed(url: String?): Boolean {
        val uri = Uri.parse(url ?: return false)
        return uri.scheme == "https" && uri.host == "neu.koblenzer-puppenspiele.de" && (uri.port == -1 || uri.port == 443)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this); setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.addJavascriptInterface(Bridge(), "KPCloudNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                if (allowed(request.url.toString())) return false
                return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                trusted = false; bridgeToken = ""; audioRequest?.deny(); audioRequest = null
                ScreenCaptureService.stop(this@MainActivity)
            }
            override fun onPageFinished(view: WebView, url: String?) {
                trusted = allowed(url)
                if (!trusted) return
                bridgeToken = UUID.randomUUID().toString()
                val token = org.json.JSONObject.quote(bridgeToken)
                view.evaluateJavascript("""(() => {
                    const token=$token;
                    window.KPStudioCloud=Object.freeze({
                        startScreen:()=>KPCloudNative.startScreen(token),
                        stopScreen:()=>KPCloudNative.stopScreen(token),
                        frame:()=>KPCloudNative.frame(token)
                    });
                })()""", null)
            }
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) { handler.cancel() }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!trusted || !allowed(request.origin.toString()) || request.resources.any { it != PermissionRequest.RESOURCE_AUDIO_CAPTURE }) { request.deny(); return@runOnUiThread }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else { audioRequest?.deny(); audioRequest=request; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 10) }
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if(audioRequest===request)audioRequest=null }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if(!trusted)return false
                chooser?.onReceiveValue(null);chooser=callback
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="image/*"; addCategory(Intent.CATEGORY_OPENABLE) }, 12)
                return true
            }
        }
        web.loadUrl("https://neu.koblenzer-puppenspiele.de/modern.html")
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if(requestCode==10){val request=audioRequest;audioRequest=null;if(trusted && results.firstOrNull()==PackageManager.PERMISSION_GRANTED)request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request?.deny()}
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==11){
            if(resultCode==RESULT_OK && data!=null && trusted)ScreenCaptureService.start(this,resultCode,data)
            web.evaluateJavascript("window.dispatchEvent(new Event('kp-screen-permission-result'))",null)
        }
        if(requestCode==12){chooser?.onReceiveValue(if(resultCode==RESULT_OK && data?.data!=null)arrayOf(data.data!!) else null);chooser=null}
    }
    inner class Bridge {
        private fun valid(token: String)=trusted && token.isNotBlank() && token==bridgeToken
        @JavascriptInterface fun startScreen(token: String){if(!valid(token))return;runOnUiThread { if(valid(token))startActivityForResult((getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager).createScreenCaptureIntent(),11) }}
        @JavascriptInterface fun stopScreen(token: String){if(valid(token))runOnUiThread { ScreenCaptureService.stop(this@MainActivity) }}
        @JavascriptInterface fun frame(token: String): String {
            if(!valid(token))return ""
            val file=ScreenCaptureService.latestFrame()?:return ""
            if(!ScreenCaptureService.running || file.length()>700000)return ""
            return runCatching { Base64.encodeToString(file.readBytes(),Base64.NO_WRAP) }.getOrDefault("")
        }
    }
    override fun onDestroy(){trusted=false;bridgeToken="";audioRequest?.deny();chooser?.onReceiveValue(null);ScreenCaptureService.stop(this);web.removeJavascriptInterface("KPCloudNative");web.destroy();super.onDestroy()}
}
