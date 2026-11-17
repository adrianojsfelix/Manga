import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastUrl, parsePlaces, parseWeather, sky } from "../src/day/weather.ts";
import { icsDate, occurrences, parseIcs } from "../src/day/ics.ts";
import { DEFAULT_WATER, dayKey, drink, newTask, noteTitle, remindWater, sanitizeTasks, sanitizeWater, sortTasks, waterToday } from "../src/day/day.ts";

test("Open-Meteo: places and the forecast", () => {
  const places = parsePlaces(JSON.stringify({ results: [{ name: "Recife", admin1: "Pernambuco", country: "Brasil", latitude: -8.05, longitude: -34.9 }] }));
  assert.deepEqual(places, [{ name: "Recife", label: "Recife, Pernambuco, Brasil", lat: -8.05, lon: -34.9 }]);
  assert.ok(forecastUrl(places[0]).includes("latitude=-8.05"));
  const w = parseWeather(JSON.stringify({
    current: { temperature_2m: 28.6, apparent_temperature: 31.2, relative_humidity_2m: 70, weather_code: 2, wind_speed_10m: 14.4, is_day: 1 },
    daily: { time: ["2026-11-17", "2026-11-18"], weather_code: [2, 61], temperature_2m_max: [30.1, 27.5], temperature_2m_min: [24, 23.4], precipitation_probability_max: [10, 80] },
  }));
  assert.equal(w?.temp, 29);
  assert.equal(w?.days[1].rain, 80);
  assert.equal(parseWeather("{}"), null);
  assert.equal(sky(61).label, "Rain");
  assert.equal(sky(0, false).icon, "🌙");
});

test("ics dates: UTC, local and all-day", () => {
  assert.equal(icsDate("20261117T130000Z")?.ms, Date.UTC(2026, 10, 17, 13));
  assert.equal(icsDate("20261117T100000")?.ms, new Date(2026, 10, 17, 10).getTime());
  assert.deepEqual(icsDate("20261117"), { ms: new Date(2026, 10, 17).getTime(), allDay: true });
  assert.equal(icsDate("x"), null);
});

const ICS = `BEGIN:VCALENDAR\r
X-WR-CALNAME:Trabalho\r
BEGIN:VEVENT\r
SUMMARY:Daily\\, time\r
DTSTART:20261116T090000\r
DTEND:20261116T091500\r
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5\r
EXDATE:20261118T090000\r
END:VEVENT\r
BEGIN:VEVENT\r
SUMMARY:Aniversário da Ana\r
DTSTART;VALUE=DATE:20261120\r
END:VEVENT\r
BEGIN:VEVENT\r
SUMMARY:Reunião com um título\r
  muito longo\r
DTSTART:20261117T150000\r
DTEND:20261117T160000\r
LOCATION:Sala 2\r
END:VEVENT\r
END:VCALENDAR`;

test("an .ics calendar: events, folded lines, repeats and exceptions", () => {
  const ev = parseIcs(ICS);
  assert.equal(ev.length, 3);
  assert.equal(ev[0].title, "Daily, time");
  assert.equal(ev[0].calendar, "Trabalho");
  assert.equal(ev[2].title, "Reunião com um título muito longo");
  assert.equal(ev[1].allDay, true);
  assert.equal(ev[1].end - ev[1].start, 86_400_000);
  const from = new Date(2026, 10, 16).getTime();
  const to = new Date(2026, 10, 30).getTime();
  const occ = occurrences(ev, from, to);
  const daily = occ.filter((o) => o.title.startsWith("Daily")).map((o) => new Date(o.start).getDate());
  // Mon 16, (Wed 18 excluded), Fri 20, Mon 23, Wed 25 — five counted, one an exception.
  assert.deepEqual(daily, [16, 20, 23, 25]);
  assert.equal(occ[0].title.startsWith("Daily"), true);
  assert.equal(occ.find((o) => o.title.startsWith("Reunião"))?.location, "Sala 2");
  assert.deepEqual(occurrences(ev, new Date(2026, 10, 21).getTime(), new Date(2026, 10, 22).getTime()), []);
});

test("tasks: pending by due date first, done last; saved ones are checked", () => {
  const a = { ...newTask("b", "2026-11-20") };
  const b = { ...newTask("a", "2026-11-18") };
  const c = { ...newTask("c"), done: true };
  const d = newTask("d");
  assert.deepEqual(sortTasks([c, d, a, b]).map((t) => t.text), ["a", "b", "d", "c"]);
  assert.deepEqual(sanitizeTasks([{ text: " " }, { text: "ok", due: "amanhã" }]).map((t) => [t.text, t.due]), [["ok", ""]]);
  assert.equal(noteTitle({ id: "1", text: "\n  Lista do mercado\nleite", updated: 0 }), "Lista do mercado");
});

test("water: counts the day, starts over the next, reminds within the hours", () => {
  const at = (h: number, m = 0, day = 17) => new Date(2026, 10, day, h, m).getTime();
  let s = waterToday(null, at(9));
  assert.equal(s.day, dayKey(at(9)));
  s = drink(s, 250, at(9));
  s = drink(s, 250, at(9, 30));
  assert.equal(s.ml, 500);
  assert.equal(remindWater(s, DEFAULT_WATER, at(10)), false, "an hour has not passed");
  assert.equal(remindWater(s, DEFAULT_WATER, at(10, 31)), true);
  assert.equal(remindWater(s, DEFAULT_WATER, at(23)), false, "past the hours");
  assert.equal(remindWater({ ...s, ml: 2000 }, DEFAULT_WATER, at(12)), false, "goal reached");
  assert.equal(waterToday(s, at(8, 0, 18)).ml, 0, "a new day");
  assert.deepEqual(sanitizeWater({ goal: 99999, every: "x" }), { ...DEFAULT_WATER, goal: 6000 });
});
