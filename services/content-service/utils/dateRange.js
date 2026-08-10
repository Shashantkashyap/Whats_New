// Shared date-window resolver for news queries. Pure (no DB): takes a query
// object and returns a Mongo `publishedAt` filter fragment plus a description
// of what was applied, so both the classic CRUD list and the executive feed /
// swipe decks agree on date semantics.
//
// Query semantics (first match wins):
//   ?all=true          -> no date restriction (mode "all")
//   ?from=…&to=…       -> inclusive range (mode "range")
//   ?date=YYYY-MM-DD   -> that single day (mode "date")
//   (nothing)          -> today's news if defaultToday, else no restriction

function dayBounds(d) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Local YYYY-MM-DD label. Using toISOString() here would shift the day in any
// non-UTC timezone (local midnight is the previous day in UTC), so format from
// the local calendar components instead.
function localDayLabel(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const isValidDate = (v) => v && !isNaN(new Date(v).getTime());

// buildDateFilter(query, { defaultToday, field }) ->
//   { filter, applied: { mode, label } }
// `field` defaults to "publishedAt". `label` is a display string (an ISO day,
// "all", a "from→to" range, or null when unrestricted).
function buildDateFilter(query = {}, { defaultToday = false, field = "publishedAt" } = {}) {
  const { date, from, to, all } = query;
  const showAll = /^(1|true|yes)$/i.test(String(all || ""));

  if (showAll) {
    return { filter: {}, applied: { mode: "all", label: "all" } };
  }

  if (from || to) {
    const range = {};
    if (isValidDate(from)) range.$gte = dayBounds(from).start;
    if (isValidDate(to)) range.$lte = dayBounds(to).end;
    const filter = Object.keys(range).length ? { [field]: range } : {};
    return {
      filter,
      applied: { mode: "range", label: `${from || "…"}→${to || "…"}` },
    };
  }

  if (isValidDate(date)) {
    const { start, end } = dayBounds(date);
    return {
      filter: { [field]: { $gte: start, $lte: end } },
      applied: { mode: "date", label: localDayLabel(start) },
    };
  }

  if (defaultToday) {
    const { start, end } = dayBounds(new Date());
    return {
      filter: { [field]: { $gte: start, $lte: end } },
      applied: { mode: "today", label: localDayLabel(start) },
    };
  }

  return { filter: {}, applied: { mode: "none", label: null } };
}

module.exports = { buildDateFilter, dayBounds };
