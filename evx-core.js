/* ============================================================================ *
 * evx-core.js — EVC Charger client shared pure-logic module.
 *
 * Used by BOTH the browser UIs (evc-dashboard.html, probe.html) via a global
 * `EvxCore` object AND by the Node test runner via CommonJS `require`.
 *
 * This module is intentionally DEPENDENCY-FREE (no DOM, no fetch) so every
 * function is unit-testable in isolation.
 * ============================================================================ */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EvxCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.2.0";
  var DEFAULT_BASE = "http://192.168.3.1/evcWebApp/";

  /* ---- constants reproduced from the original app ---- */
  var DAYS = ["Daily", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturaday", "Sunday"];
  var CHARGING_TYPE = ["Core Schedule", "Boost", "Solar Schedule", "No Schedule"];
  var LOAD_MGMT_MODES = ["Off", "Manual", "Dynamic"];
  var SUPPORT_TEXT = {
    Solar: { 0: "Not Support", 1: "Support" },
    NFC: { 0: "Not Support", 1: "Support" },
    "CT Clamp": { 0: "Not Support", 1: "Support" },
    Phase: { 1: "Single Only", 3: "Single or Three" }
  };
  var LOGO_COLORS = [
    { name: "Red", HEX: "#FF0000" }, { name: "Green", HEX: "#00FF00" },
    { name: "Blue", HEX: "#0000FF" }, { name: "Yellow", HEX: "#FFFF00" },
    { name: "Magenta", HEX: "#FF00FF" }, { name: "Cyan", HEX: "#00FFFF" },
    { name: "On", HEX: "#FFFFFF" }, { name: "Off", HEX: "#000000" }
  ];
  var DIAG_CHECKS = [
    "Run Diagnostics", "RDC-DD check", "Cable lock check", "Cable unlock check",
    "NTC1 check", "NTC2 check", "NTC3 check", "NTC4 check",
    "Relay ON check", "Relay OFF check", "Meter check", "O-PEN check"
  ];

  /* ---- endpoint list ---- */
  var ENDPOINTS = {
    status: "status",
    setting: "setting",
    meters: "meters",
    availability: "chargeAvailable",
    remote: "chargeRemote",
    randomdelay: "randomdelay",
    infoTime: "infoTime",
    infoAP: "infoAP",
    nfcList: "nfcList",
    nfcListAdd: "nfcListAdd",
    nfcListAddResult: "nfcListAddResult",
    profiles: "profiles",
    schedule: "schedule",
    loadManagement: "loadManagement",
    general: "general",
    history: "history",
    log: "log",
    debug: "debug",
    diagnostic: "diagnostic",
    upload: "upload"
  };

  /* ---- normalize base url ---- */
  function normalizeBaseUrl(raw) {
    var u = (raw == null ? "" : String(raw)).trim();
    if (!u) return DEFAULT_BASE;
    // If there is an explicit scheme that is not http(s), reject it.
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) return DEFAULT_BASE;
    // ensure a scheme
    if (!/^https?:\/\//i.test(u)) u = "http://" + u;
    var parsed;
    try {
      parsed = new URL(u);
    } catch (e) {
      return DEFAULT_BASE;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return DEFAULT_BASE;
    // strip leading/trailing slash for base joining, keep trailing slash
    var base = parsed.origin + parsed.pathname;
    base = base.replace(/\/+$/, "");          // drop trailing slashes
    return base + "/";                          // re-add exactly one
  }

  function endpointUrl(base, name) {
    var b = normalizeBaseUrl(base);
    var e = ENDPOINTS[name] || name;
    return b + e;
  }

  /* ---- time ---- */
  function secToTimeText(seconds) {
    if (seconds == null || isNaN(Number(seconds))) return "00:00:00";
    seconds = Math.max(0, Math.floor(Number(seconds))) % 86400;
    var hrs = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return pad(hrs) + ":" + pad(mins) + ":" + pad(secs);
  }

  function timeTextToSec(text) {
    if (text == null) return 0;
    var tokens = String(text).split(":");
    var hrs = parseInt(tokens[0], 10) || 0;
    var mins = parseInt(tokens[1], 10) || 0;
    var secs = parseInt(tokens[2], 10) || 0;
    return hrs * 3600 + mins * 60 + secs;
  }

  /* ---- meter decoding ---- */
  function decodeMeter(meter) {
    if (!meter) return { raw: 0, value: 0, unit: "", name: "" };
    var prec = (meter.prec == null ? 0 : Number(meter.prec));
    var valRaw = (meter.value == null ? 0 : Number(meter.value));
    var display;
    if (prec !== 0) {
      display = parseFloat((valRaw / prec).toFixed(2));
    } else {
      display = valRaw;
    }
    return { raw: valRaw, value: display, unit: meter.unit || "", name: meter.name || "" };
  }

  /* ---- diagnostic bitmask ---- */
  function parseDiagnosticBitmask(result) {
    var mask = (result == null ? 0 : Number(result)) >>> 0;
    var checks = [];
    for (var i = 0; i < DIAG_CHECKS.length; i++) {
      checks.push({ index: i, name: DIAG_CHECKS[i], failed: (mask & (1 << i)) !== 0 });
    }
    // bit 0 doubles as "run finished" marker in the original app
    var ran = checks[0].failed;
    return { mask: mask, checks: checks, ran: ran, failedCount: checks.filter(function (c) { return c.failed; }).length };
  }

  /* ---- payload builders (CSV) ---- */
  function buildSchedulePayload(schedules) {
    var lines = [];
    (schedules || []).forEach(function (s) {
      var f = [s.type, s.dow, s.start, s.stop, s.current, s.solarSource, s.status];
      lines.push(f.join(","));
    });
    return lines.join("|");
  }

  function buildProfilePayload(profiles) {
    var lines = [];
    (profiles || []).forEach(function (p) {
      var f = [p.name, p.dow, p.start, p.stop, p.current, p.status];
      lines.push(f.join(","));
    });
    return lines.join("|");
  }

  function buildLoadManagementPayload(lm) {
    lm = lm || {};
    var f = [lm.mode, lm.DLBstatus, lm.DLBpercentage, lm.MLMstatus,
             lm.MLMlimitLower, lm.MLMlimitUpper, lm.MLMcurrentLimit];
    return f.join(",");
  }

  /* ---- parse CSV responses back into objects ---- */
  function parseSchedule(data, size) {
    var arr = [];
    (data || []).forEach(function (e) {
      arr.push({
        type: Number(e.type), dow: Number(e.dow), start: Number(e.start),
        stop: Number(e.stop), current: Number(e.current),
        solarSource: Number(e.solarSource), status: Number(e.status)
      });
    });
    return arr;
  }

  function parseProfile(data, size) {
    var arr = [];
    (data || []).forEach(function (e) {
      arr.push({
        name: String(e.name), dow: Number(e.dow), start: Number(e.start),
        stop: Number(e.stop), current: Number(e.current), status: Number(e.status)
      });
    });
    return arr;
  }

  /* ---- ring buffer (localStorage capture) ---- */
  function createRingBuffer(capacity) {
    var cap = (capacity == null || capacity <= 0) ? 1000 : capacity;
    var items = [];
    var lastKey = null;
    return {
      capacity: cap,
      push: function (item) {
        var key = item && item._key;
        if (key != null && key === lastKey) return false; // dedupe consecutive identical key
        if (key != null) lastKey = key;
        items.push(item);
        if (items.length > cap) items.shift();
        return true;
      },
      all: function () { return items.slice(); },
      clear: function () { items = []; lastKey = null; },
      count: function () { return items.length; },
      last: function () { return items[items.length - 1]; }
    };
  }

  /* ---- CSV export escaping ---- */
  function csvEscape(value) {
    if (value == null) return "";
    var s = String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function metersToCsv(rows) {
    if (!rows || !rows.length) return "";
    var headers = ["timestamp", "name", "unit", "value", "raw"];
    var lines = [headers.join(",")];
    rows.forEach(function (r) {
      var row = [r.timestamp, r.name, r.unit, r.value, r.raw]
        .map(csvEscape).join(",");
      lines.push(row);
    });
    return lines.join("\n");
  }

  function metersToJson(rows) {
    return JSON.stringify(rows || [], null, 2);
  }

  /* ---- load-management mode helpers ---- */
  function lmModeIndex(modeText) {
    var i = LOAD_MGMT_MODES.indexOf(modeText);
    return i === -1 ? 0 : i;
  }
  function lmModeText(index) {
    return LOAD_MGMT_MODES[index] || LOAD_MGMT_MODES[0];
  }

  /* ---- support text ---- */
  function supportText(key, value) {
    var map = SUPPORT_TEXT[key];
    if (!map) return String(value);
    return map[value] || String(value);
  }

  /* ---- fetch helper builders (pure, for testing) ---- */
  function buildHeaderPost(headersData, timestamp) {
    var headers = { "Content-Type": "application/json" };
    if (headersData) {
      Object.keys(headersData).forEach(function (k) {
        headers[k] = headersData[k];
      });
    }
    return {
      method: "POST",
      headers: headers,
      body: { timestamp: timestamp == null ? Date.now() : timestamp }
    };
  }

  function buildBodyPost(bodyString) {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyString
    };
  }

  /* ---- small helpers ---- */
  function sanitizeNumber(n, fallback, min, max) {
    var v = Number(n);
    if (isNaN(v)) v = fallback;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  function tryParseJson(text) {
    if (text == null) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  return {
    VERSION: VERSION,
    DEFAULT_BASE: DEFAULT_BASE,
    DAYS: DAYS,
    CHARGING_TYPE: CHARGING_TYPE,
    LOAD_MGMT_MODES: LOAD_MGMT_MODES,
    LOGO_COLORS: LOGO_COLORS,
    DIAG_CHECKS: DIAG_CHECKS,
    ENDPOINTS: ENDPOINTS,
    normalizeBaseUrl: normalizeBaseUrl,
    endpointUrl: endpointUrl,
    secToTimeText: secToTimeText,
    timeTextToSec: timeTextToSec,
    decodeMeter: decodeMeter,
    parseDiagnosticBitmask: parseDiagnosticBitmask,
    buildSchedulePayload: buildSchedulePayload,
    buildProfilePayload: buildProfilePayload,
    buildLoadManagementPayload: buildLoadManagementPayload,
    parseSchedule: parseSchedule,
    parseProfile: parseProfile,
    createRingBuffer: createRingBuffer,
    csvEscape: csvEscape,
    metersToCsv: metersToCsv,
    metersToJson: metersToJson,
    lmModeIndex: lmModeIndex,
    lmModeText: lmModeText,
    supportText: supportText,
    buildHeaderPost: buildHeaderPost,
    buildBodyPost: buildBodyPost,
    sanitizeNumber: sanitizeNumber,
    tryParseJson: tryParseJson
  };
});