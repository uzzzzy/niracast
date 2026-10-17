# Security Policy

## Supported versions
Only the latest release on `main` receives security fixes.

## Reporting a vulnerability
Please do not open a public issue. Use GitHub's private vulnerability reporting
("Security" tab, "Report a vulnerability") on this repository. Include steps to
reproduce, affected version, and impact. You can expect an initial response
within 7 days.

## Deployment notes
- Set a strong `ADMIN_PASSWORD` and a persistent `SESSION_SECRET`; if left empty
  they are generated randomly at startup.
- Serve Niracast behind HTTPS (reverse proxy). Session cookies are marked
  `Secure` when the request is HTTPS.
- Mount your media directory read-only (the default compose file does).
