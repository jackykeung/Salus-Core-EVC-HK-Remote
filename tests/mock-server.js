/* ============================================================================ *
 * mock-server.js — EVC Charger API mock, used for offline testing of
 * evc-dashboard.html and probe.html.
 *
 * Replicates the exact response shapes extracted from the device dump so the
 * UIs can be exercised without the physical charger. Endpoints are served under
 * the same base path the real device uses (e.g. /evcWebApp/status).
 *
 * Each POST handler reads BOTH conventions (in-header values + raw CSV body)
 * so it reproduces the device's two transport styles.
 *
 * Usage:
 *   node tests/mock-server.js                 # port 8080, prints request log
 *   LOG=1 node tests/mock-server.js           # verbose request logging
 *   PORT=9999 node tests/mock-server.js
 * In tests:  const { start, stop, fetchLog } = require('./mock-server.js');
 * ============================================================================ */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");

const BASE_PATH = "/evcWebApp";
const log = [];
const statics = { enabled: false };

// Live mutable mock state (so GET-after-POST round trips work).
const state = {
  status: "Idle",
  setting: { logoColor: 7, chargerPhase: 1, bypassNFC: 0 },
  chargeAvailable: 0,
  randomdelay: 0,
  time: null,
  ap: { ssid: "SalusCore_01", pw: "password1" },
  nfc: { ID00: "0474906a116280", ID01: "0474906a11628a", ID02: "0474906a11628b" },
  nfcAddResult: "",
  schedule: [{ type: 0, dow: 0, start: 45000, stop: 59520, current: 7, solarSource: 0, status: 1 }],
  profiles: [{ name: "Angus W", dow: 2, start: 45000, stop: 59520, current: 7, status: 0 }],
  loadManagement: { mode: 1, DLBstatus: 0, DLBpercentage: 51, MLMstatus: 1, MLMlimitLower: 6, MLMlimitUpper: 32, MLMcurrentLimit: 12 },
  general: {
    general: {
      "Model Name": "Smart EV Charger", "Model Number": "EVX-7", "Serial Number": "SN123456",
      "Software Version": "1.2.3", "Hardware Version": "v2"
    },
    list: { Solar: 1, NFC: 1, "CT Clamp": 0, Phase: 3 }
  },
  history: [
    { authId: "AABBCCDDEEFFGG", type: 1, date: "20220801", start: 45000, duration: 3600, energy: 7200 },
    { authId: "AABBCCDDEEFFGG", type: 0, date: "20220730", start: 37800, duration: 1800, energy: 3600 }
  ],
  log: [
    { date: "20220805", time: 59520, desc: "Charger Board", disp: 0, data: 1234 },
    { date: "20220701", time: 30620, desc: "Charger Error", disp: 1, data: 0x2b },
    { date: "20220701", time: 30621, desc: "Charger Bits", disp: 2, data: 0b1010 }
  ],
  diagnostic: { status: 0, result: 0 },
  uploadImage: "firmware_v2.bin"
};

function setTimeNow() {
  const now = new Date();
  state.time = { D: String(now.getHours()).padStart(2, "0"), DATA: now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(), iso: now.toISOString() };
}

function meters() {
  // values chosen so prec scaling gives clean numbers
  return {
    data: [
      { name: "Current limit", unit: "A", value: 16000, prec: 1000, enable: true },
      { name: "Power limit", unit: "kW", value: 160, prec: 10, enable: true },
      { name: "Charging Current A", unit: "A", value: 16608, prec: 1000, enable: true },
      { name: "Charging Current C", unit: "A", value: 16608, prec: 1000, enable: false },
      { name: "Charging Voltage", unit: "V", value: 220000, prec: 1000, enable: true },
      { name: "Charging Power", unit: "kW", value: 3488210, prec: 1000, enable: true },
      { name: "Charging Energy", unit: "kWh", value: 34, prec: 0, enable: true },
      { name: "IA", unit: "A", value: 15523, prec: 100, enable: true }
    ],
    size: 8
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function ok(res, obj) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

// Parse CSV into object for the schedule/profile/loadManagement wire formats.
function parseScheduleCsv(str) {
  return (str || "").split("|").filter(Boolean).map((line) => {
    const f = line.split(",");
    return { type: Number(f[0]), dow: Number(f[1]), start: Number(f[2]), stop: Number(f[3]), current: Number(f[4]), solarSource: Number(f[5]), status: Number(f[6]) };
  });
}

function handle(req, res, body) {
  const url = req.url.split("?")[0];
  const method = req.method;
  // strip base path; e.g. /evcWebApp/status -> /status
  const ep = url.startsWith(BASE_PATH) ? url.slice(BASE_PATH.length) : url;
  // If static file serving is enabled, let the static listener own these paths.
  const STATIC = { "/evc-dashboard.html": true, "/probe.html": true, "/evx-core.js": true };
  if (statics.enabled && STATIC[url]) return;
  let hdr = {};
  Object.keys(req.headers).forEach((k) => { hdr[k] = req.headers[k]; });
  log.push({ method, ep, headers: hdr, body, t: Date.now() });
  // Node lowercases incoming header names (xdata, logocolor). Read safely.
  const H = (name) => (hdr[name] != null ? hdr[name] : hdr[name.toLowerCase()]);

  if (method === "POST") {
    if (ep === "/status") return ok(res, { DATA: state.status });
    if (ep === "/chargeRemote") { const x = String(H("XDATA")); state.status = x === "1" ? "Charging" : "Idle"; if (x === "1") state.chargeAvailable = 1; return ok(res, { status: "OK" }); }
    if (ep === "/chargeAvailable") { state.chargeAvailable = Number(H("XDATA")); return ok(res, { status: "OK" }); }
    if (ep === "/setting") {
      if (H("logoColor") != null) state.setting.logoColor = Number(H("logoColor"));
      if (H("chargerPhase") != null) state.setting.chargerPhase = Number(H("chargerPhase"));
      if (H("bypassNFC") != null) state.setting.bypassNFC = Number(H("bypassNFC"));
      return ok(res, { status: "OK" });
    }
    if (ep === "/randomdelay") { state.randomdelay = Number(H("XDATA")); return ok(res, { status: "OK" }); }
    if (ep === "/infoTime") { setTimeNow(); return ok(res, { status: "OK" }); }
    if (ep === "/infoAP") { if (H("ssid")) state.ap.ssid = H("ssid"); if (H("pw")) state.ap.pw = H("pw"); return ok(res, { status: "OK" }); }
    if (ep === "/nfcList") { if (H("XDATA") != null) { delete state.nfc["ID" + String(Number(H("XDATA"))).padStart(2, "0")]; } return ok(res, { status: 1 }); }
    if (ep === "/nfcListAdd") { state.nfcAddResult = "0474906a116280"; return ok(res, { status: "OK" }); }
    if (ep === "/nfcListAddResult") {
      if (H("XDATA") && H("XDATA") !== "NULL") state.nfc["ID04"] = H("XDATA");
      return ok(res, { status: "OK" });
    }
    if (ep === "/schedule") { state.schedule = parseScheduleCsv(body); return ok(res, { status: "OK" }); }
    if (ep === "/profiles") {
      state.profiles = (body || "").split("|").filter(Boolean).map((line) => {
        const f = line.split(",");
        return { name: f[0], dow: Number(f[1]), start: Number(f[2]), stop: Number(f[3]), current: Number(f[4]), status: Number(f[5]) };
      });
      return ok(res, { status: "OK" });
    }
    if (ep === "/loadManagement") {
      const f = body.split(",");
      state.loadManagement = { mode: Number(f[0]), DLBstatus: Number(f[1]), DLBpercentage: Number(f[2]), MLMstatus: Number(f[3]), MLMlimitLower: Number(f[4]), MLMlimitUpper: Number(f[5]), MLMcurrentLimit: Number(f[6]) };
      return ok(res, { status: "OK" });
    }
    if (ep === "/diagnostic") { state.diagnostic = { status: 1, result: 0x4 }; return ok(res, { status: "OK" }); }
    if (ep === "/debug") { return ok(res, { status: "OK" }); }
    if (ep === "/upload") { return ok(res, { status: "OK" }); }
    return ok(res, { status: "OK" });
  }

  // GET
  if (ep === "/status") return ok(res, { DATA: state.status });
  if (ep === "/setting") return ok(res, state.setting);
  if (ep === "/meters") return ok(res, meters());
  if (ep === "/chargeAvailable") return ok(res, { DATA: state.chargeAvailable });
  if (ep === "/randomdelay") return ok(res, { DATA: state.randomdelay });
  if (ep === "/infoTime") return ok(res, { DATA: Math.floor(Date.now() / 1000) % 86400 });
  if (ep === "/infoAP") return ok(res, state.ap);
  if (ep === "/nfcList") return ok(res, { DATA: [state.nfc] });
  if (ep === "/nfcListAddResult") return ok(res, { DATA: state.nfcAddResult });
  if (ep === "/schedule") return ok(res, { data: state.schedule, size: state.schedule.length });
  if (ep === "/profiles") return ok(res, { data: state.profiles, size: state.profiles.length });
  if (ep === "/loadManagement") return ok(res, { data: [state.loadManagement] });
  if (ep === "/general") return ok(res, { data: state.general });
  if (ep === "/history") return ok(res, { data: state.history, size: state.history.length });
  if (ep === "/log") return ok(res, { data: state.log, size: state.log.length });
  if (ep === "/diagnostic") return ok(res, state.diagnostic);
  if (ep === "/upload") return ok(res, { imageName: state.uploadImage, system: 0 });
  if (ep === "/" || ep === "") {
    res.writeHead(302, { Location: BASE_PATH + "/" });
    return res.end();
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

function requestHandler(req, res) {
  readBody(req).then((body) => {
    try { handle(req, res, body); }
    catch (e) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e) })); }
  });
}

function start(port, host) {
  const srv = http.createServer(requestHandler);
  return new Promise((resolve) => {
    srv.listen(port || 8080, host || "127.0.0.1", () => {
      resolve({ server: srv, port: srv.address().port, base: "http://127.0.0.1:" + srv.address().port + BASE_PATH + "/", log });
    });
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Serve the actual dashboard + core files so the UI can be loaded by URL.
function serveStatic(server) {
  const clientDir = path.resolve(__dirname, "..");
  statics.enabled = true;
  server.on("request", (req, res) => {
    const u = req.url.split("?")[0];
    const map = {
      "/evc-dashboard.html": path.join(clientDir, "evc-dashboard.html"),
      "/probe.html": path.join(clientDir, "probe.html"),
      "/evx-core.js": path.join(clientDir, "evx-core.js")
    };
    if (map[u]) {
      res.writeHead(200, { "Content-Type": u.endsWith(".js") ? "application/javascript" : "text/html" });
      res.end(fs.readFileSync(map[u]));
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const verbose = process.env.LOG === "1";
  start(port).then(({ server }) => {
    serveStatic(server);
    console.log("EVC mock server on http://127.0.0.1:" + port + BASE_PATH + "/");
    console.log("Dashboard: http://127.0.0.1:" + port + "/evc-dashboard.html");
    if (verbose) {
      setInterval(() => {
        while (log.length) {
          const r = log.shift();
          console.log(r.method, r.ep, JSON.stringify(r.headers).slice(0, 120), r.body);
        }
      }, 500);
    }
  });
}

module.exports = { start, stop, serveStatic, state, log, fetchLog: () => log.slice(), BASE_PATH };