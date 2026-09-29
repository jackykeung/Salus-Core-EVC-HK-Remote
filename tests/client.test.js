"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../evx-core.js");

/* ---------- normalizeBaseUrl ---------- */
test("normalizeBaseUrl truthy", () => {
  assert.equal(C.normalizeBaseUrl("http://192.168.3.1/evcWebApp/"), "http://192.168.3.1/evcWebApp/");
  assert.equal(C.normalizeBaseUrl("192.168.3.1/evcWebApp/"), "http://192.168.3.1/evcWebApp/");
  assert.equal(C.normalizeBaseUrl("127.0.0.1:8080/evcWebApp"), "http://127.0.0.1:8080/evcWebApp/");
  assert.equal(C.normalizeBaseUrl("https://x.y/evcWebApp/"), "https://x.y/evcWebApp/");
});
test("normalizeBaseUrl empty/whitespace -> default", () => {
  assert.equal(C.normalizeBaseUrl(""), C.DEFAULT_BASE);
  assert.equal(C.normalizeBaseUrl("   "), C.DEFAULT_BASE);
  assert.equal(C.normalizeBaseUrl(null), C.DEFAULT_BASE);
  assert.equal(C.normalizeBaseUrl(undefined), C.DEFAULT_BASE);
});
test("normalizeBaseUrl invalid scheme -> default", () => {
  assert.equal(C.normalizeBaseUrl("ftp://h/"), C.DEFAULT_BASE);
  assert.equal(C.normalizeBaseUrl("javascript:alert(1)"), C.DEFAULT_BASE);
});
test("normalizeBaseUrl malformed host -> default", () => {
  assert.equal(C.normalizeBaseUrl("http://"), C.DEFAULT_BASE);
  assert.equal(C.normalizeBaseUrl("http://:bad"), C.DEFAULT_BASE);
});
test("normalizeBaseUrl strips double trailing slashes / keeps one", () => {
  assert.equal(C.normalizeBaseUrl("http://h/evcWebApp///"), "http://h/evcWebApp/");
  assert.equal(C.normalizeBaseUrl("http://h/evcWebApp"), "http://h/evcWebApp/");
});

/* ---------- endpointUrl ---------- */
test("endpointUrl builds correct URL with base", () => {
  assert.equal(C.endpointUrl("http://192.168.3.1/evcWebApp/", "status"), "http://192.168.3.1/evcWebApp/status");
  assert.equal(C.endpointUrl("192.168.3.1/evcWebApp", "meters"), "http://192.168.3.1/evcWebApp/meters");
});
test("endpointUrl unknown name passed through", () => {
  assert.equal(C.endpointUrl("http://h/e/", "weird"), "http://h/e/weird");
});

/* ---------- secToTimeText ---------- */
test("secToTimeText basic", () => {
  assert.equal(C.secToTimeText(0), "00:00:00");
  assert.equal(C.secToTimeText(45), "00:00:45");
  assert.equal(C.secToTimeText(45000), "12:30:00");
  assert.equal(C.secToTimeText(86399), "23:59:59");
});
test("secToTimeText padding single digits", () => {
  assert.equal(C.secToTimeText(60), "00:01:00");
  assert.equal(C.secToTimeText(3661), "01:01:01");
});
test("secToTimeText overflow wraps at 86400", () => {
  assert.equal(C.secToTimeText(86400), "00:00:00");
  assert.equal(C.secToTimeText(90061), "01:01:01");
});
test("secToTimeText invalid/negative -> 00:00:00", () => {
  assert.equal(C.secToTimeText(null), "00:00:00");
  assert.equal(C.secToTimeText(NaN), "00:00:00");
  assert.equal(C.secToTimeText("abc"), "00:00:00");
  assert.equal(C.secToTimeText(-5), "00:00:00");
});
test("secToTimeText floats floor", () => {
  assert.equal(C.secToTimeText(45.9), "00:00:45");
});

/* ---------- timeTextToSec ---------- */
test("timeTextToSec basic", () => {
  assert.equal(C.timeTextToSec("12:30:00"), 45000);
  assert.equal(C.timeTextToSec("00:00:00"), 0);
  assert.equal(C.timeTextToSec("23:59:59"), 86399);
});
test("timeTextToSec missing tokens default 0", () => {
  assert.equal(C.timeTextToSec("12"), 43200);
  assert.equal(C.timeTextToSec("12:30"), 45000);
  assert.equal(C.timeTextToSec(""), 0);
  assert.equal(C.timeTextToSec(null), 0);
  assert.equal(C.timeTextToSec(undefined), 0);
});
test("timeTextToSec non-numeric tokens parsed as number-ish", () => {
  assert.equal(C.timeTextToSec("a:30:00"), 1800);
});

/* ---------- decodeMeter ---------- */
test("decodeMeter scales by prec", () => {
  assert.deepEqual(C.decodeMeter({ name: "V", value: 220000, prec: 1000, unit: "V" }),
    { raw: 220000, value: 220, unit: "V", name: "V" });
});
test("decodeMeter prec 0 returns raw", () => {
  assert.deepEqual(C.decodeMeter({ name: "E", value: 34, prec: 0, unit: "kWh" }),
    { raw: 34, value: 34, unit: "kWh", name: "E" });
});
test("decodeMeter prec 100 (IA)", () => {
  const d = C.decodeMeter({ name: "IA", value: 15523, prec: 100, unit: "A" });
  assert.equal(d.value, 155.23);
});
test("decodeMeter missing fields default", () => {
  assert.deepEqual(C.decodeMeter(null), { raw: 0, value: 0, unit: "", name: "" });
  assert.deepEqual(C.decodeMeter({}), { raw: 0, value: 0, unit: "", name: "" });
});
test("decodeMeter null prec treated as zero", () => {
  const d = C.decodeMeter({ value: 99 });
  assert.equal(d.value, 99);
});

/* ---------- parseDiagnosticBitmask ---------- */
test("parseDiagnosticBitmask no bits", () => {
  const r = C.parseDiagnosticBitmask(0);
  assert.equal(r.failedCount, 0);
  assert.equal(r.ran, false);
});
test("parseDiagnosticBitmask single bit", () => {
  const r = C.parseDiagnosticBitmask(0x8);
  assert.equal(r.checks[3].failed, true);
  assert.equal(r.checks[3].index, 3);
  assert.equal(r.failedCount, 1);
});
test("parseDiagnosticBitmask bit0 marks ran", () => {
  const r = C.parseDiagnosticBitmask(0x1);
  assert.equal(r.ran, true);
});
test("parseDiagnosticBitmask multiple + all bits", () => {
  const r = C.parseDiagnosticBitmask(0xFFF);
  assert.equal(r.failedCount, 12);
});
test("parseDiagnosticBitmask null/undefined", () => {
  assert.equal(C.parseDiagnosticBitmask(null).failedCount, 0);
  assert.equal(C.parseDiagnosticBitmask().mask, 0);
});
test("parseDiagnosticBitmask negative coerced unsigned", () => {
  const r = C.parseDiagnosticBitmask(-1);
  assert.equal(r.mask, 4294967295);
});

/* ---------- buildSchedulePayload ---------- */
test("buildSchedulePayload single", () => {
  assert.equal(C.buildSchedulePayload([{ type: 0, dow: 0, start: 45000, stop: 59520, current: 7, solarSource: 0, status: 0 }]),
    "0,0,45000,59520,7,0,0");
});
test("buildSchedulePayload multiple joined by |", () => {
  assert.equal(C.buildSchedulePayload([
    { type: 0, dow: 0, start: 1, stop: 2, current: 3, solarSource: 4, status: 5 },
    { type: 1, dow: 1, start: 6, stop: 7, current: 8, solarSource: 9, status: 0 }
  ]), "0,0,1,2,3,4,5|1,1,6,7,8,9,0");
});
test("buildSchedulePayload empty array", () => {
  assert.equal(C.buildSchedulePayload([]), "");
  assert.equal(C.buildSchedulePayload(), "");
});
test("buildSchedulePayload injection with comma/pipe", () => {
  const out = C.buildSchedulePayload([{ type: 0, dow: 0, start: 1, stop: 2, current: 3, solarSource: 4, status: 5 }, { type: 99, dow: 9, start: 9, stop: 9, current: 9, solarSource: 9, status: 9 }]);
  assert.equal(out, "0,0,1,2,3,4,5|99,9,9,9,9,9,9");
});

/* ---------- buildProfilePayload ---------- */
test("buildProfilePayload single", () => {
  assert.equal(C.buildProfilePayload([{ name: "Angus W", dow: 2, start: 45000, stop: 59520, current: 7, status: 0 }]),
    "Angus W,2,45000,59520,7,0");
});
test("buildProfilePayload empty", () => {
  assert.equal(C.buildProfilePayload([]), "");
  assert.equal(C.buildProfilePayload(), "");
});

/* ---------- buildLoadManagementPayload ---------- */
test("buildLoadManagementPayload", () => {
  assert.equal(C.buildLoadManagementPayload({ mode: 1, DLBstatus: 0, DLBpercentage: 51, MLMstatus: 1, MLMlimitLower: 6, MLMlimitUpper: 32, MLMcurrentLimit: 12 }),
    "1,0,51,1,6,32,12");
});
test("buildLoadManagementPayload empty object defaults undefined", () => {
  assert.equal(C.buildLoadManagementPayload(), ",,,,,,");
});

/* ---------- parseSchedule / parseProfile ---------- */
test("parseSchedule maps objects", () => {
  const r = C.parseSchedule([{ type: "1", dow: "2", start: "100", stop: "200", current: "7", solarSource: "0", status: "1" }], 1);
  assert.equal(r[0].type, 1);
  assert.equal(r[0].status, 1);
  assert.equal(r.length, 1);
});
test("parseSchedule empty", () => {
  assert.deepEqual(C.parseSchedule([], 0), []);
  assert.deepEqual(C.parseSchedule(), []);
});
test("parseProfile maps objects", () => {
  const r = C.parseProfile([{ name: "x", dow: "2", start: "100", stop: "200", current: "7", status: "1" }], 1);
  assert.equal(r[0].name, "x");
  assert.equal(r[0].dow, 2);
});

/* ---------- createRingBuffer ---------- */
test("ring buffer push/all/count/last/clear", () => {
  const r = C.createRingBuffer(3);
  assert.equal(r.count(), 0);
  assert.equal(r.push({ _key: "a", v: 1 }), true);
  assert.equal(r.push({ _key: "b", v: 2 }), true);
  assert.equal(r.push({ _key: "c", v: 3 }), true);
  assert.equal(r.count(), 3);
  assert.equal(r.last().v, 3);
  assert.equal(r.all().length, 3);
  r.clear();
  assert.equal(r.count(), 0);
});
test("ring buffer wraps beyond capacity", () => {
  const r = C.createRingBuffer(3);
  r.push({ _key: "a" }); r.push({ _key: "b" }); r.push({ _key: "c" });
  r.push({ _key: "d" });
  assert.equal(r.count(), 3);
  assert.deepEqual(r.all().map((x) => x._key), ["b", "c", "d"]);
});
test("ring buffer dedupes consecutive same key", () => {
  const r = C.createRingBuffer(5);
  assert.equal(r.push({ _key: "k", v: 1 }), true);
  assert.equal(r.push({ _key: "k", v: 2 }), false);
  r.push({ _key: "z" });
  assert.equal(r.count(), 2);
});
test("ring buffer capacity default 1000, invalid -> 1000", () => {
  assert.equal(C.createRingBuffer().capacity, 1000);
  assert.equal(C.createRingBuffer(0).capacity, 1000);
  assert.equal(C.createRingBuffer(-5).capacity, 1000);
  assert.equal(C.createRingBuffer(7).capacity, 7);
});

/* ---------- csvEscape ---------- */
test("csvEscape plain", () => {
  assert.equal(C.csvEscape("hello"), "hello");
  assert.equal(C.csvEscape(5), "5");
  assert.equal(C.csvEscape(null), "");
  assert.equal(C.csvEscape(undefined), "");
});
test("csvEscape quotes", () => {
  assert.equal(C.csvEscape('a,"b'), '"a,""b"');
  assert.equal(C.csvEscape("a\nb"), '"a\nb"');
  assert.equal(C.csvEscape("a,b"), '"a,b"');
});

/* ---------- metersToCsv ---------- */
test("metersToCsv empty returns empty string", () => {
  assert.equal(C.metersToCsv(null), "");
  assert.equal(C.metersToCsv([]), "");
});
test("metersToCsv header + rows", () => {
  const out = C.metersToCsv([{ timestamp: 1, name: "V", unit: "V", value: 220, raw: 220000 }]);
  const lines = out.split("\n");
  assert.equal(lines[0], "timestamp,name,unit,value,raw");
  assert.equal(lines[1], "1,V,V,220,220000");
});

/* ---------- metersToJson ---------- */
test("metersToJson stringifies", () => {
  assert.equal(C.metersToJson([{ a: 1 }]), '[\n  {\n    "a": 1\n  }\n]');
  assert.equal(C.metersToJson(null), "[]");
});

/* ---------- lmMode helpers ---------- */
test("lmModeIndex", () => {
  assert.equal(C.lmModeIndex("Off"), 0);
  assert.equal(C.lmModeIndex("Manual"), 1);
  assert.equal(C.lmModeIndex("Dynamic"), 2);
  assert.equal(C.lmModeIndex("nope"), 0);
});
test("lmModeText", () => {
  assert.equal(C.lmModeText(0), "Off");
  assert.equal(C.lmModeText(2), "Dynamic");
  assert.equal(C.lmModeText(99), "Off");
});

/* ---------- supportText ---------- */
test("supportText mapped", () => {
  assert.equal(C.supportText("Solar", 1), "Support");
  assert.equal(C.supportText("Solar", 0), "Not Support");
  assert.equal(C.supportText("Phase", 3), "Single or Three");
  assert.equal(C.supportText("Phase", 1), "Single Only");
});
test("supportText unknown key/value", () => {
  assert.equal(C.supportText("Foo", 1), "1");
  assert.equal(C.supportText("Solar", 99), "99");
});
test("supportText null value", () => {
  assert.equal(C.supportText("Solar", null), "null");
});

/* ---------- buildHeaderPost ---------- */
test("buildHeaderPost merges data into headers, body timestamp", () => {
  const o = C.buildHeaderPost({ XDATA: "1", foo: "bar" }, 12345);
  assert.equal(o.method, "POST");
  assert.equal(o.headers["Content-Type"], "application/json");
  assert.equal(o.headers.XDATA, "1");
  assert.equal(o.headers.foo, "bar");
  assert.deepEqual(o.body, { timestamp: 12345 });
});
test("buildHeaderPost default timestamp now", () => {
  const o = C.buildHeaderPost({ a: 1 });
  assert.equal(typeof o.body.timestamp, "number");
});
test("buildHeaderPost null/empty data", () => {
  const o = C.buildHeaderPost(null, 5);
  assert.deepEqual(Object.keys(o.headers), ["Content-Type"]);
  assert.deepEqual(o.body, { timestamp: 5 });
  const o2 = C.buildHeaderPost();
  assert.equal(typeof o2.body.timestamp, "number");
});

/* ---------- buildBodyPost ---------- */
test("buildBodyPost sets content-type json + raw body", () => {
  const o = C.buildBodyPost("1,0,51");
  assert.equal(o.method, "POST");
  assert.equal(o.headers["Content-Type"], "application/json");
  assert.equal(o.body, "1,0,51");
});

/* ---------- sanitizeNumber ---------- */
test("sanitizeNumber valid", () => {
  assert.equal(C.sanitizeNumber(5, 1, 0, 10), 5);
  assert.equal(C.sanitizeNumber("5", 1, 0, 10), 5);
});
test("sanitizeNumber NaN -> fallback", () => {
  assert.equal(C.sanitizeNumber(NaN, 7), 7);
  assert.equal(C.sanitizeNumber("abc", 7), 7);
});
test("sanitizeNumber clamp min/max", () => {
  assert.equal(C.sanitizeNumber(-5, 0, 1, 10), 1);
  assert.equal(C.sanitizeNumber(99, 0, 1, 10), 10);
});
test("sanitizeNumber no bounds", () => {
  assert.equal(C.sanitizeNumber(42), 42);
});

/* ---------- tryParseJson ---------- */
test("tryParseJson valid object", () => {
  assert.deepEqual(C.tryParseJson('{"a":1}'), { a: 1 });
});
test("tryParseJson invalid -> null", () => {
  assert.equal(C.tryParseJson("{bad"), null);
  assert.equal(C.tryParseJson(null), null);
  assert.equal(C.tryParseJson(undefined), null);
});

/* ---------- constants sanity ---------- */
test("constants", () => {
  assert.equal(C.DAYS.length, 8);
  assert.equal(C.CHARGING_TYPE.length, 4);
  assert.equal(C.LOAD_MGMT_MODES.length, 3);
  assert.equal(C.DIAG_CHECKS.length, 12);
  assert.equal(Array.isArray(C.LOGO_COLORS), true);
  assert.equal(C.LOGO_COLORS.length, 8);
  assert.ok(C.ENDPOINTS.status === "status");
  assert.ok(C.ENDPOINTS.upload === "upload");
});