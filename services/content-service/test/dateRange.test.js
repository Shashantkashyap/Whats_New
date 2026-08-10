const test = require("node:test");
const assert = require("node:assert");
const { buildDateFilter } = require("../utils/dateRange");

const todayLabel = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

test("no params + defaultToday=false leaves the query unrestricted", () => {
  const { filter, applied } = buildDateFilter({});
  assert.deepEqual(filter, {});
  assert.equal(applied.mode, "none");
  assert.equal(applied.label, null);
});

test("no params + defaultToday=true restricts to today", () => {
  const { filter, applied } = buildDateFilter({}, { defaultToday: true });
  assert.equal(applied.mode, "today");
  assert.equal(applied.label, todayLabel());
  assert.ok(filter.publishedAt.$gte instanceof Date);
  assert.ok(filter.publishedAt.$lte instanceof Date);
});

test("all=true wins over everything and drops the date filter", () => {
  const { filter, applied } = buildDateFilter({ all: "true", date: "2024-01-01" }, { defaultToday: true });
  assert.deepEqual(filter, {});
  assert.equal(applied.mode, "all");
});

test("explicit date bounds the whole day", () => {
  const { filter, applied } = buildDateFilter({ date: "2024-03-15" });
  assert.equal(applied.mode, "date");
  assert.equal(applied.label, "2024-03-15");
  assert.equal(filter.publishedAt.$gte.getHours(), 0);
  assert.equal(filter.publishedAt.$lte.getHours(), 23);
});

test("from/to build an inclusive range and ignore invalid endpoints", () => {
  const { filter, applied } = buildDateFilter({ from: "2024-01-01", to: "not-a-date" });
  assert.equal(applied.mode, "range");
  assert.ok(filter.publishedAt.$gte instanceof Date);
  assert.equal(filter.publishedAt.$lte, undefined);
});

test("respects a custom field name", () => {
  const { filter } = buildDateFilter({ date: "2024-03-15" }, { field: "createdAt" });
  assert.ok(filter.createdAt);
  assert.equal(filter.publishedAt, undefined);
});
