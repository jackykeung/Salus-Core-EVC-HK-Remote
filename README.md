# Salus Core EV Charger Remote

A self-contained, dependency-free web client for remotely monitoring and
controlling a **Salus Core EV Charger** over its on-device web interface
(AP mode, Hong Kong / local-network use). Built entirely by reverse-engineering
the charger's factory web app, with the full endpoint map published below.

> ⚠️ **IMPORTANT — NOT AFFILIATED WITH SALUS.**
>
> This is an **independent hobby project** created by an individual, for
> **personal use**, to enhance remote-control capability over **my own**
> charger. It is **not** associated with, endorsed by, funded by, or supported
> by the Salus development team or any manufacturer. It was built solely by
> studying the charger's own on-device web interface and the public HTTP API
> it exposes. Any product or trademark names are used only to identify the
> hardware this tool targets.
>
> **NO WARRANTY. USE AT YOUR OWN RISK.**
>
> This software is provided **"AS IS"**, **WITHOUT WARRANTY OF ANY KIND**,
> express or implied, including but not limited to the warranties of
> merchantability, fitness for a particular purpose, and non-infringement.
> **The author accepts NO liability whatsoever** for any damage to the charger,
> your vehicle, your property, or for any direct, indirect, incidental,
> special, or consequential loss arising from the use of, or inability to use,
> this software, **even if advised of the possibility of such damage**.
>
> **The charger is a physical device.** Sending an incorrect command — notably
> a firmware upload (`upload`) — can **damage or brick** the unit. Only issue a
> command you fully understand. The device exposes an *unauthenticated* local
> API: any device on the charger's network can control it. **Use this only
> against hardware you own, on a private network.**
>
> By using this software you accept that it is provided without any guarantee
> or warranty of fitness for any purpose, and that you use it entirely at your
> own risk.

---

## What it does

- **Monitor** — live charging meters (decoded from the device's `value/prec`
  scale), device status, availability, device clock, schedule, charge profiles,
  load-management config, charging history, and the onboard charger log.
- **Control** — remote start/stop charging, unlock the cable, set phase / logo
  colour / load-management mode and current limit, edit the Core/Boost/Solar
  schedule, manage NFC cards, and run the on-board diagnostic self-test.
- **Data** — auto-captures meter snapshots to a local ring buffer and exports
  CSV / JSON.

No external libraries, no CDN, fully offline after download. Works on the phone
that's connected to the charger's own Wi-Fi (AP mode).

## Endpoint analysis (reverse-engineered)

The complete reference lives in [`EVX-API.md`](EVX-API.md). Summary table —
all paths are relative to the base **`http://192.168.3.1/evcWebApp/`** (this is
the charger's **factory-default** address in AP mode; it is not a secret, and
it is how the device ships — you can confirm it publicly).

| Endpoint (relative) | Methods | Purpose |
|---------------------|---------|---------|
| `status`            | GET     | Charger status string |
| `setting`           | GET/POST| `logoColor` (0-7), `chargerPhase` (1/3), `bypassNFC` (0/1) |
| `meters`            | GET     | Live meter readings (`value`/`prec` scaled) |
| `chargeAvailable`   | GET/POST| Lock / unlock cable (`XDATA` 0 or 1) |
| `chargeRemote`      | POST    | Remote start / stop charging (`XDATA` 1 / 0) |
| `randomdelay`       | GET/POST| Hidden random-start delay (`XDATA` seconds) |
| `infoTime`          | GET/POST| Device time / time sync |
| `infoAP`            | GET/POST| AP SSID / password **(not wired in client)** |
| `nfcList`           | GET/POST| List / remove registered NFC cards |
| `nfcListAdd` / `nfcListAddResult` | POST/GET | Scan & register an NFC card |
| `profiles`          | GET/POST| Named charge profiles (CSV body) |
| `schedule`          | GET/POST| Core / Boost / Solar schedule (CSV body) |
| `loadManagement`    | GET/POST| Off / Manual / Dynamic load management (CSV body) |
| `general`           | GET     | Device info + hardware support list |
| `history`           | GET     | Charging history |
| `log`               | GET     | On-board charger log |
| `debug`             | POST    | LED PWM (hidden Dev tab) |
| `diagnostic`        | GET/POST| On-board self test (12-check bitmask) |
| `upload`            | GET/POST| OTA firmware flash **(brick risk — advanced only)** |

**Two POST conventions** (the device uses both — a client must replicate them):

1. **In-header:** every field is merged into the HTTP `headers` object; the
   body is just `{ "timestamp": ... }`. Used by `setting`, `chargeRemote`,
   `chargeAvailable`, `randomdelay`, `infoTime`, `infoAP`, `nfcList*`,
   `diagnostic`, `debug`.
2. **Raw body (CSV):** a comma / pipe-delimited string sent as the body.
   Used by `schedule`, `profiles`, `loadManagement`.

**Meter decoding:** each meter has `value` and `prec`; `display = prec > 0 ?
(value / prec) : value`. `prec` is a divisor (e.g. Current `16000/1000 = 16 A`).

**Diagnostic bitmask:** `result` is a bitmask; bit `i` set = check `i` failed.
12 checks: Run, RDC-DD, cable lock, cable unlock, NTC1-4, relay ON/OFF, meter,
O-PEN. Bit 0 doubles as a "run finished" marker.

See [`EVX-API.md`](EVX-API.md) for the full detail, the security findings, and
the list of factory-hidden features.

## Files

| File | Purpose |
|------|---------|
| `evc-dashboard.html` | Full control + data dashboard (PWA-ready, bottom tab nav). |
| `probe.html` | Minimal endpoint probe (raw JSON + manual POST). |
| `evx-core.js` | Shared pure-logic module (parsing, payloads, time, buffers). |
| `EVX-API.md` | Reverse-engineering specification and endpoint reference. |
| `tests/mock-server.js` | Local mock of the charger API (offline testing). |
| `tests/client.test.js` | Unit tests for `evx-core.js`. |
| `tests/dashboard.test.js` | End-to-end transport tests (both POST conventions). |

## Running the tests

```bash
npm test            # node --test --experimental-test-coverage tests/
npm run mock        # serves mock API + dashboard at http://127.0.0.1:8080
```

Uses Node's native test runner. No dependencies to install.

## Using it on your phone

The dashboard is a **single self-contained file** — `evx-core.js` is inlined, so
`evc-dashboard.html` is the **only** file you need to move to the phone.

**Easiest — AirDrop (no server at all):**

1. AirDrop `evc-dashboard.html` to your iPhone and open it in Safari.
   A `file://` page is not subject to mixed-content blocking, so it reaches the
   charger's `http://192.168.3.1/…` API fine as long as the phone is on the
   charger's Wi-Fi.
2. **Home Screen install:** Safari → Share → **Add to Home Screen** (PWA meta
   tags included) to launch it full-screen standalone.
3. **Theme:** the header button is a clean 2-state toggle (dark ⇄ light); the
   first run follows your system setting, each tap flips + persists it.
4. **Live control requires the phone to be on the charger's Wi-Fi** (AP mode).
   The base URL is absolute, so the page need not live on the charger itself —
   but the phone must be connected to the charger's AP (`SalusCore_…`).

**Alternative — serve locally:** `npm run mock` serves the mock API + dashboard
at `http://127.0.0.1:8080` for offline preview.

> ⚠️ **Mixed content:** the charger speaks plain `http://`. If you instead host
> the page over `https`, Safari blocks the `fetch("http://192.168.3.1/…")`
> calls. Use AirDrop (local file) or serve over plain `http` for live control.

The base URL defaults to `http://192.168.3.1/evcWebApp/` and is editable.

## Deliberately excluded

`infoAP` (changing the charger's own AP SSID/password) is **not wired** into
any provided client — it is documented only for awareness. Changing the
charger's AP credentials can lock you out of the box.

## License

MIT. See [LICENSE](LICENSE).