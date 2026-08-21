# Staging-only FTP sandbox – latest

Generated: 2026-08-21T17:05:16Z
Outcome: failure
Expected account root: staging WordPress root (/htdocs/neu on hosting side)
Production access: excluded by hosting FTP start directory

```text
ftp://***USER***@***SERVER***:21
Access failed: 550 wp-content: No such file or directory (/wp-content)
get: Access failed: 550 wp-config.php: No such file or directory (/wp-config.php)
put: /tmp/kp-staging-access-32500008724.txt: Access failed: 550 wp-content/kp-staging-access-32500008724.txt: No such file or directory (/wp-content/kp-staging-access-32500008724.txt)
ERROR: wp-config.php not readable from FTP root
```
