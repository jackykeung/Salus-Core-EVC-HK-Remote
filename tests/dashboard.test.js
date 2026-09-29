"use strict";

const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../evx-core.js");
const mock = require("./mock-server.js");

let srv, base, server;

before(async () => {
  const r = await mock.start(0);
  server = r.server;
  base = r.base;
  mock.serveStatic(server);
});

after(() => mock.stop(server));

/* Reproduces the dashboard's fetch layer (evc-dashboard.html) exactly. */
function endpoint(name) {
  return C.endpointUrl(base, name);
}
async function getEp(name) {
  const res = await fetch(endpoint(name), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function postHeader(name, data) {
  const opts = C.buildHeaderPost(data);
  const res = await fetch(endpoint(name), {
    method: "POST",
    headers: opts.headers,
    body: JSON.stringify(opts.body),
    cache: "no-store"
  });
  return res.json();
}
async function postBody(name, bodyStr) {
  const opts = C.buildBodyPost(bodyStr);
  const res = await fetch(endpoint(name), {
    method: "POST",
    headers: opts.headers,
    body: opts.body,
    cache: "no-store"
  });
  return res.json();
}

test("GET status returns DATA string", async () => {
  const d = await getEp("status");
  assert.equal(typeof d.DATA, "string");
});

test("GET meters returns data array with prec scaling", async () => {
  const d = await getEp("meters");
  assert.ok(Array.isArray(d.data));
  assert.equal(d.size, d.data.length);
  const v = d.data.find((m) => m.name === "Charging Voltage");
  assert.equal(C.decodeMeter(v).value, 220);
});

test("GET chargeAvailable returns 0/1", async () => {
  const d = await getEp("chargeAvailable");
  assert.equal(d.DATA, 0);
});

test("GET setting returns object", async () => {
  const d = await getEp("setting");
  assert.equal(typeof d.logoColor, "number");
  assert.equal(typeof d.chargerPhase, "number");
  assert.equal(typeof d.bypassNFC, "number");
});

test("GET general returns general + list", async () => {
  const d = await getEp("general");
  assert.ok(d.data.general);
  assert.ok(d.data.list);
  assert.equal(d.data.list.Phase, 3);
});

test("GET history + log shapes", async () => {
  const h = await getEp("history");
  assert.ok(Array.isArray(h.data));
  assert.ok(h.data[0]);
  assert.equal(typeof h.data[0].authId, "string");
  const l = await getEp("log");
  assert.ok(Array.isArray(l.data));
});

test("POST chargeRemote in-header start -> status becomes Charging", async () => {
  await postHeader("chargeRemote", { XDATA: 1 });
  const st = await getEp("status");
  assert.equal(st.DATA, "Charging");
});

test("POST chargeRemote in-header stop -> status Idle", async () => {
  await postHeader("chargeRemote", { XDATA: 0 });
  const st = await getEp("status");
  assert.equal(st.DATA, "Idle");
});

test("POST chargeAvailable unlock then GET reflects", async () => {
  await postHeader("chargeAvailable", { XDATA: 1 });
  const d = await getEp("chargeAvailable");
  assert.equal(d.DATA, 1);
  await postHeader("chargeAvailable", { XDATA: 0 });
});

test("POST setting logoColor / phase / bypassNFC round-trip", async () => {
  await postHeader("setting", { logoColor: 3 });
  let s = await getEp("setting");
  assert.equal(s.logoColor, 3);
  await postHeader("setting", { chargerPhase: 3 });
  s = await getEp("setting");
  assert.equal(s.chargerPhase, 3);
  await postHeader("setting", { bypassNFC: 1 });
  s = await getEp("setting");
  assert.equal(s.bypassNFC, 1);
});

test("POST debug (in-header r/g/b via dashboard-style)", async () => {
  await postHeader("debug", { r: 1000, g: 500, b: 200 });
  // no assertion beyond no throw; mock returns OK
});

test("POST diagnostic start then GET status/result", async () => {
  await postHeader("diagnostic", { start: 1 });
  const d = await getEp("diagnostic");
  assert.equal(d.status, 1);
  assert.equal(typeof d.result, "number");
});

test("schedule CSV body round-trip (dashboard uses buildSchedulePayload)", async () => {
  const payload = [
    { type: 0, dow: 0, start: 45000, stop: 59520, current: 7, solarSource: 0, status: 1 },
    { type: 1, dow: 0, start: 300, stop: 400, current: 8, solarSource: 0, status: 0 }
  ];
  await postBody("schedule", C.buildSchedulePayload(payload));
  const d = await getEp("schedule");
  assert.equal(d.size, 2);
  assert.equal(d.data[1].type, 1);
  assert.equal(d.data[0].current, 7);
});

test("loadManagement CSV body round-trip", async () => {
  await postBody("loadManagement", C.buildLoadManagementPayload({ mode: 1, DLBstatus: 0, DLBpercentage: 51, MLMstatus: 1, MLMlimitLower: 6, MLMlimitUpper: 32, MLMcurrentLimit: 12 }));
  const d = await getEp("loadManagement");
  assert.equal(d.data[0].mode, 1);
  assert.equal(d.data[0].MLMcurrentLimit, 12);
});

test("profiles CSV body round-trip with name", async () => {
  const payload = [{ name: "Angus W", dow: 2, start: 45000, stop: 59520, current: 7, status: 1 }];
  await postBody("profiles", C.buildProfilePayload(payload));
  const d = await getEp("profiles");
  assert.equal(d.data[0].name, "Angus W");
  assert.equal(d.data[0].dow, 2);
});

test("POST infoTime sync", async () => {
  const date = new Date();
  await postHeader("infoTime", { t: date.getTime(), tzo: date.getTimezoneOffset(), tz: "UTC", iso: date.toISOString(), lts: date.toLocaleTimeString("en-US", { hour12: false }) });
  const d = await getEp("infoTime");
  assert.equal(typeof d.DATA, "number");
});

test("POST randomdelay round-trip", async () => {
  await postHeader("randomdelay", { XDATA: 900 });
  const d = await getEp("randomdelay");
  assert.equal(d.DATA, 900);
});

test("POST nfcListAdd then GET nfcListAddResult + nfcList", async () => {
  await postHeader("nfcListAdd", { XDATA: "scan" });
  const res = await getEp("nfcListAddResult");
  assert.equal(res.DATA, "0474906a116280");
  const list = await getEp("nfcList");
  assert.ok(list.DATA[0]);
});

test("POST nfcListAddResult register a card", async () => {
  await postHeader("nfcListAddResult", { XDATA: "AAAA" });
  const list = await getEp("nfcList");
  assert.equal(list.DATA[0].ID04, "AAAA");
});

test("POST nfcList remove a card", async () => {
  const beforeList = await getEp("nfcList");
  const key = Object.keys(beforeList.DATA[0])[0]; // e.g. ID00
  const idx = Number(key.slice(2));
  await postHeader("nfcList", { XDATA: idx });
  const afterList = await getEp("nfcList");
  assert.equal(afterList.DATA[0][key], undefined);
});

test("POST upload OTA headers (OTACMD DATA + FileName) and GET imageName", async () => {
  const resp = await fetch(endpoint("upload"), {
    method: "POST",
    headers: { OTACMD: "DATA", FileName: "firmware.bin" },
    body: new Uint8Array([1, 2, 3])
  });
  assert.equal((await resp.json()).status, "OK");
  const d = await getEp("upload");
  assert.equal(typeof d.imageName, "string");
});

test("GET root redirects 302", async () => {
  const resp = await fetch(base.replace(/evcWebApp\/$/, ""), { redirect: "manual" });
  assert.equal(resp.status, 302);
});

test("unknown endpoint returns 404", async () => {
  const resp = await fetch(endpoint("doesnotexist"));
  assert.equal(resp.status, 404);
});

test("broker: dashboard error branch - non-object meter decode via decodeMeter", async () => {
  // The dashboard decodes meters; verify the null-safety path used when a meter is missing.
  assert.deepEqual(C.decodeMeter(null), { raw: 0, value: 0, unit: "", name: "" });
});