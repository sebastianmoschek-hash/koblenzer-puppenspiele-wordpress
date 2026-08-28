# Staging Web-App Self-Heal

For the owner Web-App on `neu.koblenzer-puppenspiele.de`, an explicit repair command may directly update one low-risk browser asset on `feature/webapp-primary-agent`.

Direct self-heal scope:
- `owner-web-agent.js`
- `owner-web-agent-fast-chat.js`
- `owner-web-agent.css`

The browser sends recent runtime diagnostics (for example speech-recognition errors) with the repair request. The server chooses one of the fixed browser assets, asks Gemini for a minimal exact search/replace patch, validates it, requires `risk=low`, re-reads the GitHub source to avoid overwriting a newer commit, and writes only to the staging feature branch. The Staging live-loader makes that commit visible after reload.

Out of scope for direct self-heal and still gated by review/CI: Production, PHP, WordPress auth/nonce/capability logic, backend/server changes, Android/Kotlin/APK, CI/workflows, credentials, and external network destinations.

This sandbox exists so the owner does not have to act as the routine debugger for small Web-App runtime/UI faults. Production safety remains separate.
