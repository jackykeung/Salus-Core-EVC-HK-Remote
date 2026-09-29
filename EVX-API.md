# EVC Charger Web API — Reverse-Engineering Reference

Source dump: `~/evc-dump/` (Salus Core EV Charger, AP mode, `http://192.168.3.1`).

This document is the authoritative reference derived from the embedded web app
(`evcWebApp.html`, `evcWebApp.js`, `evcWebApp.css`) and the live `api_probes.txt`.

---

## 1. Base URL

All API endpoints are served under a **sub-folder**, not the site root:

```
Base = http://192.168.3.1/evcWebApp/
```

Evidence (`api_probes.txt`):

- `GET /` → `302 text/html` (redirects into the app)
- `GET /evcWebApp/status` → `200 application/json`

If you host this static web app yourself (on a phone/computer), fetch calls are
**relative to the page**, so a client hosted on the charger's own LAN must use the
**absolute** base `http://192.168.3.1/evcWebApp/`. This lets the client be hosted
anywhere reachable on the device's Wi-Fi.

> **Mixed content:** the charger is plain `http`. A page served over `https` will
> be *blocked* by Safari when it tries to fetch `http://192.168.3.1/*`. Host/serve
> your client over `http` (or as a local file) when you need live calls.

---

## 2. Endpoint Reference

All endpoints are relative to the Base URL above. The JS keeps this list in
`requestUrlList` (evcWebApp.js line 51). Two **distinct POST conventions** exist —
see §3.

| Endpoint (relative) | Methods | Purpose | Notes / payload |
|---------------------|---------|---------|-----------------|
| `status`            | GET     | Charger status string | → `{ "DATA": "<status>" }` |
| `setting`           | GET/POST| Round-trip settings    | GET → `{ logoColor, chargerPhase, bypassNFC }`. POST via in-header: `logoColor` (0-7), `chargerPhase` (1/3), `bypassNFC` (0/1) |
| `meters`            | GET     | Live meter readings    | → `{ "data": [ {name,unit,value,prec,enable} ], "size": N }` |
| `chargeAvailable`   | GET/POST| Lock / Unlock          | GET → `{ "DATA": 0|1 }`. POST in-header `XDATA: 0|1` |
| `chargeRemote`      | POST    | Remote start / stop charge | POST in-header `XDATA: 1` (start) / `XDATA: 0` (stop) |
| `randomdelay`       | GET/POST| Random-delay (hidden)  | GET → `{ "DATA": <sec> }`. POST in-header `XDATA: <sec>` |
| `infoTime`          | GET/POST| Device time            | GET → `{ "DATA": "HH:MM:SS" }`. POST in-header `{ t, tzo, tz, iso, lts }` |
| `infoAP`            | GET/POST| AP SSID / password     | GET → `{ ssid, pw }`. POST in-header `{ ssid, pw }`. **Not wired into client (see §5)** |
| `nfcList`           | GET/POST| Registered NFC cards  | GET → `{ "DATA": [ { ID00:.., ID01:.. } ] }`. POST in-header `XDATA: <index>` to remove a card |
| `nfcListAdd`        | POST    | Trigger NFC scan       | POST in-header `XDATA: "scan"` |
| `nfcListAddResult`  | GET/POST| Read / confirm scanned card | GET → `{ "DATA": "<uid>" }`. POST in-header `XDATA: "<uid>"` or `"NULL"` |
| `profiles`          | GET/POST| Charging profiles      | CSV body — see §3 |
| `schedule`          | GET/POST| Core / Boost / Solar schedule | CSV body — see §3 |
| `loadManagement`    | GET/POST| Manual / Dynamic load mgmt | CSV body — see §3 |
| `general`           | GET     | Device info + supports | → `{ "data": { general: {...}, list: { Solar, NFC, "CT Clamp", Phase } } }` |
| `history`           | GET     | Charging history       | → `{ "data": [ {authId,type,date,start,duration,energy} ], "size": N }` |
| `log`               | GET     | Charger log            | → `{ "data": [ {date,time,desc,disp,data} ], "size": N }` |
| `debug`             | POST    | LED PWM (Debug tab)    | POST — values merged into **HTTP headers** `r,g,b`, body `{timestamp}` |
| `diagnostic`        | GET/POST| On-board self test     | POST in-header `start: 1`. GET → `{ "status": 0|1, "result": <bitmask> }` |
| `upload`            | GET/POST| OTA firmware flash     | GET → `{ imageName, system }`. POST raw `.bin` via XHR with headers `OTACMD: DATA`, `FileName: <name>` |

---

## 3. Two POST conventions (critical)

The original app uses **two different ways** to send data. A new client must
replicate both. The original JS calls:

| Helper (evcWebApp.js) | Convention | Used by |
|-----------------------|-----------|---------|
| `httpRequestPostDataToHeader({...}, url)` (line 1481) | **In-header**: every key is merged into the HTTP `headers` object; body is just `{ timestamp: Date.now() }` | `setting`, `chargeAvailable`, `chargeRemote`, `randomdelay`, `infoTime`, `infoAP`, `nfcList`, `nfcListAdd`, `nfcListAddResult`, `diagnostic`, `debug` |
| `httpRequestPostDataToHeaderBody(data, url)` (line 431) | **Raw body**: `Content-Type: application/json`, `data` is a **comma/pipe-delimited string** sent as the body | `schedule`, `profiles`, `loadManagement` |

### 3.1 In-header example (`chargeRemote`)
```
POST /evcWebApp/chargeRemote
Headers: { "Content-Type": "application/json", "XDATA": "1" }
Body:    { "timestamp": 1720000000000 }
```

### 3.2 CSV body formats

**schedule** — one entry per `|`, 7 fields:
```
type,dow,start,stop,current,solarSource,status|
...
```
- `type`: 0 = Core, 1 = Boost, 2 = Solar
- `dow`: 0 = Daily, 1-7 = Mon..Sun
- `start`/`stop`: seconds-of-day (e.g. `45000` = 12:30:00)
- `current`: amps (integer ≥ 1)
- `solarSource`: 0/1
- `status`: 0/1

**profiles** — one entry per `|`, 6 fields:
```
name,dow,start,stop,current,status|...
```
(`name` ≤ 10 chars in the UI.)

**loadManagement** — single comma-string:
```
mode,DLBstatus,DLBpercentage,MLMstatus,MLMlimitLower,MLMlimitUpper,MLMcurrentLimit
```
- `mode`: 0 = Off, 1 = Manual, 2 = Dynamic
- `DLBpercentage`: 0-100

---

## 4. Data decoding

### 4.1 Meters (`prec` scaling)
Each meter has `value` (raw int) and `prec` (divisor) and `unit`:
```
display = prec > 0 ? (value / prec).toFixed(2) : value
```
Examples (from `chargerDataInit_ChargerMeters`):
| name | prec | unit |
|------|------|------|
| Current limit / Charging Current A/B/C | 1000 | A |
| Power limit | 10 | kW |
| Charging Voltage | 1000 | V |
| Charging Power | 1000 | kW |
| Charging Energy | 0 (integer) | kWh |
| Supply Capacity | 1000 | A |
| IA / IB / IC | 100 | A |
| NTC 1-4, Phase, Availability | 0 | — |

### 4.2 Time conversions
```
secToTimeText(sec)  -> "HH:MM:SS"   (seconds-of-day)
timeTextToSec("HH:MM:SS") -> sec    (hours*3600 + mins*60 + sec)
```
Boost's `start` is computed as "now, floored to the minute".

### 4.3 Diagnostic bitmask
`result` is a bitmask; bit `i` set = check `i` failed. 12 checks (index 0-11):
```
0 Run Diagnostics   1 RDC-DD check   2 Cable lock check   3 Cable unlock check
4 NTC1   5 NTC2   6 NTC3   7 NTC4   8 Relay ON   9 Relay OFF   10 Meter   11 O-PEN
```
Note: the original treats **bit 0** ambiguously (double as "completed" flag in the
render); a passing run may show index 0 as "Failed". Treat bit 0 as "run finished".

### 4.4 Days of week
```
0 Daily, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday, 7 Sunday
```

---

## 5. Security findings (from source review)

> These are observations about the **device's own** embedded app. Do not use them
> against hardware you do not own.

1. **No authentication / authorization (CWE-306).** No session, token, origin check
   or CORS policy anywhere. Every endpoint — including `chargeRemote` (start/stop
   charge), `chargeAvailable` (unlock cable), `infoAP` (change AP password), and
   `upload` (flash firmware) — is reachable by any device on the charger's Wi-Fi.
   The AP is open (no password), so the network itself is unauthenticated.
2. **No CSRF protection.** All POSTs are `Content-Type: application/json` with no
   token; a malicious same-network page could fire them (subject to mixed-content
   rules).
3. **Control values sent as HTTP headers.** `debug` and `httpRequestPostDataToHeader`
   put `r,g,b`, `XDATA`, etc. into HTTP headers rather than the body. Headers are
   logged/proxied and have size limits; this is a design smell and enlarges the
   exploit surface (header injection if any value is ever attacker-influenced).
4. **Unauthenticated OTA flash (`upload`).** A raw `.bin` POST with no visible
   signature/version check in the client can reflash or brick the device. Highest
   impact endpoint.
5. **Profiles / schedule CSV injection.** `profile.name` is contenteditable and,
   while capped at 10 chars by a client-side `keydown` guard, is written raw into a
   comma/pipe-delimited body. A name containing `,` or `|` corrupts the whole
   payload (format confusion).
6. **Async races (client-only bugs).** `chargerGetDeviceTimeToView` reads a var set
   inside `.then()` from `.finally()` (line 1695) → can render `NaN:NaN`; several
   listeners are bound by invoking a closure-returning function eagerly
   (works, but convoluted). `waitForConditionWithTimeout` comment says 100 ms but
   polls every 3000 ms.
7. **NFC flow TOCTOU.** The add-scan waits a fixed 5000 ms then reads the result;
   there is no abort path and repeated taps can stack.

`infoAP` (change the charger's own AP SSID/password) is intentionally **NOT
wired** into the provided client (per requirement). It is documented here only for
awareness.

---

## 6. Hidden / gated features in the original app

| Feature | Gate in original | Notes |
|---------|------------------|-------|
| Random delay | `globalConfig.Randomdelay = false` (line 42) | POST `randomdelay` `XDATA: <seconds>` |
| Dynamic Load Balancing (mode 2) | `BTN_LM_DLB` commented in HTML (line 134) | needs CT clamp; check supportlist `"CT Clamp"` |
| Load-management status row | `globalConfig.loadManagement.status = false` | |
| AP credential editor | infoBox `display:none` (HTML line 104) | **not wired in client** |
| Charge Remote **Start** | `hideView("BTN_remoteChargeStart")` (line 2362) | `chargeRemote` `XDATA:1` still works |
| Debug (LED PWM) tab | `hideView("TAP_Debug")` (line 2344) | `chargerViewInit_Debug` fully built |
| Profile tab | `hideView("TAP_chargeProfile")` (line 2345) | `chargerViewInit_Profile` fully built |
| NFC Bypass toggle | `globalConfig.bypassNFC = true` (line 41) | `setting` `bypassNFC` |

**Boost meaning:** a *schedule* entry (`type:1`, `dow:0`) that sets `start = now`
and a user-chosen `stop`. It defines a now→stop charge window (the "booster"),
distinct from `chargeRemote` (a one-shot start). Both are exposed in the client:
the big Start/Stop toggle uses `chargeRemote`; the Schedule tab edits the Boost
window and POSTs to `schedule`.