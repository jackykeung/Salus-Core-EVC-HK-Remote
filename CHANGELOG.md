# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-29

### Added
- Full reverse-engineered client for the Salus Core EV Charger on-device web
  API (AP mode, `http://192.168.3.1/evcWebApp/`).
- `evc-dashboard.html` — control + data dashboard with Home / Control /
  Schedule / History / Data / Dev tabs (PWA-ready, light/dark theme).
- `probe.html` — minimal endpoint probe with raw JSON + manual POST.
- `evx-core.js` — dependency-free shared pure-logic module (UMD: browser +
  Node): endpoint map, base-URL normalization, time conversions, meter `prec`
  decoding, diagnostic bitmask parser, CSV payload builders/parsers, ring
  buffer, CSV/JSON export, HTTP request builders.
- `EVX-API.md` — authoritative endpoint reference, the two POST conventions,
  meter + diagnostic decoding, security findings, hidden-feature list.
- `tests/` — mock-server + unit tests + transport tests (86 tests, Node native
  runner with coverage).
- This README (hobby project, no affiliation with Salus, no warranty), MIT
  LICENSE.

[1.0.0]: https://github.com/jackykeung/salus-core-evc-remote