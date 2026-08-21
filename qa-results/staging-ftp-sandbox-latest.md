# Staging-only FTP sandbox – latest

Generated: 2026-08-21T15:55:56Z
Outcome: failure
Expected account root: staging WordPress root (/htdocs/neu on hosting side)
Production access: excluded by hosting FTP start directory

```text
ftp://***USER***@***SERVER***:21
Login failed: 530 Login incorrect.
Login failed: 530 Login incorrect.
get: /wp-config.php: Login failed: 530 Login incorrect.
put: /tmp/kp-staging-access-32500008724.txt: Login failed: 530 Login incorrect.
ERROR: wp-config.php not readable from FTP root
```
