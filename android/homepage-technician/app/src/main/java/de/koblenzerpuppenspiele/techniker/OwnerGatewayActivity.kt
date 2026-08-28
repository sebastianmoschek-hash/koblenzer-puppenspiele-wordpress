package de.koblenzerpuppenspiele.techniker

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * First-run gateway for the native Homepage-Hilfe shell.
 *
 * Chrome and Android WebView intentionally use separate cookie stores. A newly
 * installed app therefore needs one WordPress login inside the app before the
 * server exposes the protected Bearbeiten/KI owner UI. Once the WordPress
 * logged-in cookie exists, future launches go straight to LiveLocalActivity.
 */
class OwnerGatewayActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var hint: TextView
    private lateinit var progress: ProgressBar
    private var openingOwner = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        CookieManager.getInstance().setAcceptCookie(true)
        if (hasOwnerCookie()) {
            openOwnerApp()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(18, 15, 13))
        }
        hint = TextView(this).apply {
            text = "Homepage-Hilfe · einmal bei WordPress anmelden"
            setTextColor(Color.WHITE)
            textSize = 17f
            gravity = Gravity.CENTER_VERTICAL
            setPadding(28, 24, 28, 18)
        }
        progress = ProgressBar(this).apply {
            isIndeterminate = true
        }
        webView = WebView(this)
        root.addView(hint, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 6))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            userAgentString = userAgentString + " KoblenzerPuppenspieleOwnerLogin/1.0"
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                return !(uri.scheme == "https" && isTrustedHost(uri.host))
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progress.visibility = android.view.View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progress.visibility = android.view.View.GONE
                CookieManager.getInstance().flush()
                if (hasOwnerCookie()) {
                    hint.text = "Angemeldet · Bearbeiten und KI werden geöffnet …"
                    webView.postDelayed({ openOwnerApp() }, 250L)
                } else {
                    hint.text = "Bitte mit deinem WordPress-Konto anmelden"
                }
            }
        }
        webView.loadUrl(loginUrl())
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized && hasOwnerCookie()) openOwnerApp()
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun loginUrl(): String {
        val target = ownerUrl()
        val base = Uri.parse(BuildConfig.HOMEPAGE_URL)
        return base.buildUpon()
            .clearQuery()
            .path("/wp-login.php")
            .appendQueryParameter("redirect_to", target)
            .appendQueryParameter("reauth", "1")
            .build()
            .toString()
    }

    private fun ownerUrl(): String {
        val base = Uri.parse(BuildConfig.HOMEPAGE_URL)
        return base.buildUpon()
            .clearQuery()
            .appendQueryParameter("kp_edit", "1")
            .appendQueryParameter("kp_ai", "1")
            .build()
            .toString()
    }

    private fun hasOwnerCookie(): Boolean {
        val base = Uri.parse(BuildConfig.HOMEPAGE_URL)
        val origin = "${base.scheme}://${base.host}/"
        val cookies = CookieManager.getInstance().getCookie(origin).orEmpty()
        return cookies.split(';').any { it.trim().startsWith("wordpress_logged_in_") }
    }

    private fun openOwnerApp() {
        if (openingOwner) return
        openingOwner = true
        startActivity(Intent(this, LiveLocalActivity::class.java).apply {
            data = Uri.parse("koblenzerpuppenspiele://vision?url=" + Uri.encode(ownerUrl()))
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        })
        finish()
    }

    private fun isTrustedHost(host: String?): Boolean {
        val value = host?.lowercase().orEmpty()
        return value == "koblenzer-puppenspiele.de" || value == "neu.koblenzer-puppenspiele.de"
    }
}
