# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Project: **Salus Core EV Charger Remote** (Hong Kong · AP mode)
License: MIT (see LICENSE)

---

## [Unreleased]

### Planned
- Live telemetry dashboard with configurable polling interval.
- Optional read-only mode that never sends a write command.
- Additional transport tests covering the two POST conventions.

---

## [1.1.0] - 2026-09-29

### Added
- **General tab** in the dashboard: device info (model / serial / firmware) and
  the hardware support list (Solar, NFC, CT Clamp, Phase) via the `general`
  endpoint, rendered as human-readable "Support / Not Support" text.
- **Auto theme**: the dashboard now follows the OS light/dark preference
  (`prefers-color-scheme`) by default, with a manual override toggle persisted
  to localStorage.
- **Live chart**: charging current / power sparkline driven by the ring-buffer
  of meter snapshots.
- `evx-core.js` now exposes `VERSION` (synced with the package version).
- `package.json`: added `author`, `license`, `keywords`, and a `start` alias.

### Changed
- `evc-dashboard.html` expanded (45 KB → 56 KB) with the new General tab and
  charts.
- Base-URL handling, NFC scan flow, and diagnostic bitmask rendering tightened.

### Fixed
- Mixed-content note: live API calls from an https-hosted page are blocked by
  Safari; documented clearly (serve over http, or open as a local file).

---

## [1.0.0] - 2026-09-29

### Added
- First release of a self-contained, dependency-free web client for the Salus
  Core EV Charger on-device web API (AP mode, `http://192.168.3.1/evcWebApp/`).
- `evc-dashboard.html` — control and data dashboard with Home / Control /
  Schedule / History / Data / Dev tabs (PWA-ready, bottom tab navigation).
- `probe.html` — minimal endpoint probe with raw JSON output and manual POST.
- `evx-core.js` — shared pure-logic module (UMD: browser + Node): endpoint map,
  base-URL normalization, time conversions, meter `prec` decoding, diagnostic
  bitmask parser, CSV payload builders/parsers, ring buffer, CSV/JSON export,
  and HTTP request builders.
- `EVX-API.md` — authoritative endpoint reference, the two POST conventions,
  meter and diagnostic decoding, security findings, and hidden-feature list.
- `tests/` — mock server, unit tests, and transport tests (86 tests via Node's
  native test runner with coverage).
- MIT LICENSE and this CHANGELOG.

[Unreleased]: https://github.com/jackykeung/Salus-Core-EVC-HK-Remote/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/jackykeung/Salus-Core-EVC-HK-Remote/commits/main
[1.0.0]: https://github.com/jackykeung/Salus-Core-EVC-HK-Remote