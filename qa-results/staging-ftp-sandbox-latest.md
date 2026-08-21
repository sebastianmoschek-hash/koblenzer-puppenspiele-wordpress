# Staging-only FTP sandbox – latest

Generated: 2026-08-21T17:07:30Z
Outcome: success
Expected account root: staging WordPress root (/htdocs/neu on hosting side)
Production access: excluded by hosting FTP start directory

```text
ftp://***USER***@***SERVER***:21
/.htaccess
/index.php
/license.txt
/readme.html
/visual-qa/
/wordpress/
/wp-activate.php
/wp-admin/
/wp-blog-header.php
/wp-comments-post.php
/wp-config-sample.php
/wp-config.php
/wp-content/
/wp-cron.php
/wp-includes/
/wp-links-opml.php
/wp-load.php
/wp-login.php
/wp-mail.php
/wp-settings.php
/wp-signup.php
/wp-trackback.php
/xmlrpc.php
/wp-content/.kp-staging-maintenance-requests/
/wp-content/index.php
/wp-content/languages/
/wp-content/mu-plugins/
/wp-content/plugins/
/wp-content/themes/
/wp-content/upgrade/
/wp-content/upgrade-temp-backup/
/wp-content/uploads/
PASS: new FTP account reaches the staging WordPress root and can write/remove inside wp-content.
```
