# GrabClientsNow Privacy Policy

Last updated: 2026-02-23

This Privacy Policy explains how GrabClientsNow ("we", "our", "us") handles information when you use the GrabClientsNow Chrome extension.

## 1. Who we are

GrabClientsNow is a browser extension that helps users monitor Facebook groups and organize potential leads.

Contact: grabclientsnow@gmail.com

## 2. Data we process

Depending on your settings and usage, the extension may process:

- License/session data used for access control (email and license status).
- Extension configuration data (language, monitor settings, selected groups, keyword rules, notification preferences, onboarding state).
- Lead monitoring data (group name/id, post metadata, post text snippets, author/profile links, timestamps, history stored in extension local storage).
- Notification data (desktop notification state, unread counters, webhook/telegram settings).
- Technical logs generated inside the extension UI.

## 3. Where data is stored

- Most operational data is stored locally in your browser via `chrome.storage.local`.
- License-related data can be processed by Supabase services configured by GrabClientsNow.
- If you enable optional channels, lead payloads can be sent to:
  - Your webhook URL (provided by you), and/or
  - GrabClientsNow Telegram notification endpoint (for configured Telegram delivery).

## 4. How we use data

We use processed data to:

- Validate licenses and maintain access state.
- Run monitoring features requested by the user.
- Deliver alerts/notifications configured by the user.
- Show lead history and related UI metrics.
- Provide diagnostics and support troubleshooting.
- Improve product reliability and security.

## 5. Data sharing

We do not sell personal data.

Data may be shared only as necessary to provide requested features, such as:

- Supabase infrastructure for license/account state.
- User-configured webhook destination.
- Telegram delivery endpoint when Telegram notifications are enabled.

## 6. Permissions and access

The extension requests Chrome permissions needed for core functionality, such as:

- `storage`, `tabs`, `scripting`, `alarms`, `notifications`.
- Host permissions for Facebook and Supabase endpoints.
- Optional host permissions for user-provided webhook destinations (requested at runtime).

## 7. Retention

- Local extension data remains stored until cleared by the user, overwritten by new data, or removed by uninstalling the extension.
- Some histories are automatically pruned by TTL rules in the extension (for example, lead/notification history windows).

## 8. Security

We apply reasonable technical measures to protect data handled by the extension. However, no method of transmission or storage is 100% secure.

## 9. Your choices

You can:

- Control notification channels and webhook destination in extension settings.
- Clear lead history and related operational data through extension controls.
- Clear your saved license and stop using the extension at any time.
- Uninstall the extension to remove local extension data from the browser profile.

## 10. Third-party services and platforms

GrabClientsNow interacts with third-party platforms and services (for example, Facebook, Gumroad, and Supabase). Their terms and privacy policies also apply to data processed on their systems.

## 11. Children's privacy

The extension is not intended for children under 13, and we do not knowingly collect personal data from children.

## 12. Changes to this policy

We may update this Privacy Policy from time to time. The "Last updated" date at the top indicates the latest revision.

## 13. Contact

For privacy questions or requests, contact:

grabclientsnow@gmail.com
