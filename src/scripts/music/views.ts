import type { MusicStats, RangeStats } from "@/lib/music";

import { formatDate, formatNumber, html, offsetWithin, slug, svg } from "./dom";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CURRENT_ROWS = 5;
const CURRENT_ROW_PX = 40;

export function renderArtists(container: Element, range: RangeStats) {
  const [top, ...rest] = range.topArtists;
  if (!top) {
    container.replaceChildren(renderEmpty());
    return;
  }

  const share = range.plays > 0 ? top.plays / range.plays : 0;
  const ring = 2 * Math.PI * 42;

  const spotlight = html("div", { class: "ms-spotlight ms-enter" }, [
    html("span", { class: "ms-spotlight-rank", text: "01" }),
    html("div", { class: "ms-spotlight-body" }, [
      html("span", {
        class: "ms-spotlight-kicker",
        text: "Most played artist",
      }),
      html("span", { class: "ms-spotlight-name", text: top.name }),
      html("span", {
        class: "ms-spotlight-meta",
        text: `${formatNumber(top.plays)} plays · ${formatNumber(top.minutes)} minutes`,
      }),
    ]),
    svg(
      "svg",
      {
        "aria-label": `${Math.round(share * 100)}% of all plays`,
        class: "ms-ring",
        role: "img",
        viewBox: "0 0 100 100",
      },
      [
        svg("circle", { class: "ms-ring-track", cx: 50, cy: 50, r: 42 }),
        svg("circle", {
          class: "ms-ring-value",
          cx: 50,
          cy: 50,
          r: 42,
          style: `--dash: ${ring}; --offset: ${ring * (1 - share)}`,
        }),
        svg("text", { class: "ms-ring-label", x: 50, y: 50 }, [
          document.createTextNode(`${Math.round(share * 100)}%`),
        ]),
        svg("text", { class: "ms-ring-caption", x: 50, y: 66 }, [
          document.createTextNode("of plays"),
        ]),
      ]
    ),
  ]);

  const list = html(
    "ol",
    { class: "ms-bars", start: 2 },
    rest.slice(0, 9).map((artist, index) =>
      html(
        "li",
        {
          class: "ms-bar ms-enter",
          style: `--i: ${index}; --value: ${artist.plays / top.plays}`,
        },
        [
          html("span", {
            class: "ms-bar-rank",
            text: String(index + 2).padStart(2, "0"),
          }),
          html("span", { class: "ms-bar-name", text: artist.name }),
          html("span", {
            class: "ms-bar-value",
            text: formatNumber(artist.plays),
          }),
        ]
      )
    )
  );

  container.replaceChildren(spotlight, list);
}

export function renderTracks(container: Element, range: RangeStats) {
  const top = range.topTracks[0];
  if (!top) {
    container.replaceChildren(renderEmpty());
    return;
  }

  const list = html(
    "ol",
    { class: "ms-track-list" },
    range.topTracks.map((track, index) => {
      const title = track.url
        ? html("a", {
            class: "ms-track-name",
            href: track.url,
            text: track.name,
          })
        : html("span", { class: "ms-track-name", text: track.name });

      return html(
        "li",
        {
          class: "ms-track ms-enter",
          style: `--i: ${index}; --value: ${track.plays / top.plays}`,
        },
        [
          html("span", { class: "ms-track-rank", text: String(index + 1) }),
          html("span", { class: "ms-track-text" }, [
            title,
            html("span", { class: "ms-track-artist", text: track.artist }),
          ]),
          html("span", {
            class: "ms-track-plays",
            text: `${formatNumber(track.plays)}×`,
          }),
        ]
      );
    })
  );

  container.replaceChildren(list);
}

interface CurrentColumn {
  artists: { name: string; plays: number }[];
  label: string;
  title: string;
}

/**
 * The columns of the currents chart: months for relative ranges and years,
 * and calendar years for all time.
 */
export function getCurrentColumns(
  stats: MusicStats,
  range: RangeStats
): CurrentColumn[] {
  if (range.id === "all") {
    return stats.ranges
      .filter((candidate) => /^\d+$/.test(candidate.id) && candidate.plays > 0)
      .toReversed()
      .map((year) => ({
        artists: year.topArtists.slice(0, CURRENT_ROWS),
        label: year.label,
        title: year.label,
      }));
  }

  const byMonth = new Map(stats.months.map((month) => [month.month, month]));
  const currentMonth = stats.generatedAt.slice(0, 7);
  const keys = /^\d+$/.test(range.id)
    ? getMonthKeys(`${range.id}-12`, 12).filter((key) => key <= currentMonth)
    : getMonthKeys(currentMonth, range.id === "12m" ? 12 : 6);

  // Months without a single play get no column.
  return keys.flatMap((key) => {
    const artists = byMonth.get(key)?.artists.slice(0, CURRENT_ROWS) ?? [];
    if (artists.length === 0) return [];
    const date = `${key}-01`;
    return {
      artists,
      label: formatDate(date, {
        day: undefined,
        month: "short",
        year: undefined,
      }),
      title: formatDate(date, { day: undefined, month: "long" }),
    };
  });
}

// The `count` calendar months up to and including `last`, oldest first, so
// quiet months still get their column.
function getMonthKeys(last: string, count: number) {
  const [year, month] = last.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1 - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

/**
 * A chart in the spirit of tangled's activity graph: one column per period,
 * the top artists ranked inside it, and a line linking each artist from
 * period to period. Hovering or focusing an artist follows its whole path.
 */
export function renderCurrents(
  container: HTMLElement,
  columns: CurrentColumn[]
) {
  if (columns.length === 0) {
    container.replaceChildren(renderEmpty());
    return;
  }

  const board = html("div", {
    class: "ms-currents-board",
    style: `--columns: ${columns.length}; --rows: ${CURRENT_ROWS}; --row: ${CURRENT_ROW_PX}px`,
  });
  const lines = svg("svg", {
    "aria-hidden": "true",
    class: "ms-currents-lines",
  });
  board.append(lines);

  columns.forEach((column, columnIndex) => {
    const element = html("div", {
      class: "ms-current-column ms-enter",
      style: `--i: ${columnIndex}`,
    });

    column.artists.forEach((artist, rank) => {
      const button = html(
        "button",
        {
          "aria-label": `${artist.name}: ${formatNumber(artist.plays)} plays in ${column.title}`,
          class: "ms-current",
          "data-artist": slug(artist.name),
          style: `--rank: ${rank}`,
          type: "button",
        },
        [
          html("span", {
            class: "ms-current-count",
            text: formatNumber(artist.plays),
          }),
          html("span", { class: "ms-current-name", text: artist.name }),
        ]
      );
      element.append(button);
    });

    element.append(
      html("span", { class: "ms-current-label", text: column.label })
    );
    board.append(element);
  });

  const scroller = html(
    "div",
    {
      "aria-label": "Currents, scrollable",
      class: "ms-currents-scroll",
      role: "region",
      tabindex: 0,
    },
    [board]
  );
  container.replaceChildren(scroller);
  const nav = container
    .closest("section")
    ?.querySelector<HTMLElement>(".ms-currents-nav");

  const setActive = (artist: string | undefined) => {
    board.toggleAttribute("data-active", Boolean(artist));
    for (const element of board.querySelectorAll<HTMLElement | SVGElement>(
      "[data-artist]"
    )) {
      element.classList.toggle("is-active", element.dataset.artist === artist);
    }
  };
  board.addEventListener("pointerover", (event) => {
    const target = (event.target as Element).closest<HTMLElement>(
      ".ms-current"
    );
    setActive(target?.dataset.artist);
  });
  board.addEventListener("pointerleave", () => setActive(undefined));
  board.addEventListener("focusin", (event) => {
    setActive((event.target as HTMLElement).dataset.artist);
  });
  board.addEventListener("focusout", () => setActive(undefined));

  const draw = () => {
    drawCurrentLines(board, lines);
    updateScrollState(scroller, nav);
  };
  scroller.addEventListener("scroll", () => updateScrollState(scroller, nav), {
    passive: true,
  });
  if (nav) {
    // Every render replaces the previous handler.
    navHandlers.get(nav)?.abort();
    const handler = new AbortController();
    navHandlers.set(nav, handler);
    nav.addEventListener(
      "click",
      (event) => {
        const button = (event.target as Element).closest<HTMLElement>(
          "[data-step]"
        );
        const column = board.querySelector<HTMLElement>(".ms-current-column");
        if (!button || !column) return;
        scroller.scrollBy({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          left: Number(button.dataset.step) * column.offsetWidth,
        });
      },
      { signal: handler.signal }
    );
  }
  requestAnimationFrame(() => {
    // Start at the most recent period on narrow screens.
    scroller.scrollLeft = scroller.scrollWidth;
    draw();
  });

  observers.get(container)?.disconnect();
  const observer = new ResizeObserver(draw);
  observer.observe(board);
  observers.set(container, observer);
}

const observers = new WeakMap<Element, ResizeObserver>();
const navHandlers = new WeakMap<Element, AbortController>();

function drawCurrentLines(board: HTMLElement, lines: SVGSVGElement) {
  lines.setAttribute(
    "viewBox",
    `0 0 ${board.offsetWidth} ${board.offsetHeight}`
  );
  lines.replaceChildren();

  // Layout offsets instead of screen boxes, so the entrance animation of the
  // columns can't shift the lines away from the names.
  const columns = [
    ...board.querySelectorAll<HTMLElement>(".ms-current-column"),
  ];
  columns.slice(0, -1).forEach((column, index) => {
    const next = columns[index + 1];
    if (!next) return;

    // Lines run straight out of the name, and only bend in the gutter
    // between two columns, so they never cross another artist's name.
    const gutter = offsetWithin(column, board).right - 30;
    for (const from of column.querySelectorAll<HTMLElement>(".ms-current")) {
      const to = next.querySelector<HTMLElement>(
        `.ms-current[data-artist="${from.dataset.artist}"]`
      );
      if (!to) continue;

      const name = offsetWithin(
        from.querySelector<HTMLElement>(".ms-current-name")!,
        board
      );
      const count = offsetWithin(
        to.querySelector<HTMLElement>(".ms-current-count")!,
        board
      );
      const fromBox = offsetWithin(from, board);
      const toBox = offsetWithin(to, board);
      const x1 = name.right + 8;
      const y1 = (fromBox.top + fromBox.bottom) / 2;
      const x2 = count.left - 6;
      const y2 = (toBox.top + toBox.bottom) / 2;
      const bendStart = Math.max(x1, gutter);
      if (x2 <= bendStart) continue;

      const bend = (x2 - bendStart) / 2;
      lines.append(
        svg("path", {
          class: "ms-current-line",
          d: `M ${x1} ${y1} H ${bendStart} C ${bendStart + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
          "data-artist": from.dataset.artist,
          pathLength: 1,
          style: `--i: ${index}`,
        })
      );
    }
  });
}

function updateScrollState(
  scroller: HTMLElement,
  nav: HTMLElement | null | undefined
) {
  const hasMoreBefore = scroller.scrollLeft > 4;
  const hasMoreAfter =
    scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
  const state = [hasMoreBefore && "start", hasMoreAfter && "end"]
    .filter(Boolean)
    .join(" ");
  if (state) scroller.dataset.scroll = state;
  else delete scroller.dataset.scroll;

  if (!nav) return;
  nav.hidden = !hasMoreBefore && !hasMoreAfter;
  const [earlier, later] = nav.querySelectorAll("button");
  if (earlier) earlier.disabled = !hasMoreBefore;
  if (later) later.disabled = !hasMoreAfter;
}

export function renderClock(container: Element, range: RangeStats) {
  const max = Math.max(...range.hours, 1);
  const peak = range.hours.indexOf(Math.max(...range.hours));
  const center = 110;
  const inner = 38;
  const outer = 100;

  const wedges = range.hours.map((count, hour) => {
    const start = (hour / 24) * Math.PI * 2 - Math.PI / 2 + 0.02;
    const end = ((hour + 1) / 24) * Math.PI * 2 - Math.PI / 2 - 0.02;
    const radius = inner + (outer - inner) * Math.sqrt(count / max);
    const point = (angle: number, r: number) =>
      `${center + Math.cos(angle) * r} ${center + Math.sin(angle) * r}`;

    return svg(
      "path",
      {
        class: `ms-clock-wedge${hour === peak ? " is-peak" : ""}`,
        d: `M ${point(start, inner)} L ${point(start, radius)} A ${radius} ${radius} 0 0 1 ${point(end, radius)} L ${point(end, inner)} A ${inner} ${inner} 0 0 0 ${point(start, inner)} Z`,
        style: `--i: ${hour}`,
      },
      [
        svg("title", {}, [
          document.createTextNode(
            `${formatNumber(count)} plays at ${String(hour).padStart(2, "0")}:00`
          ),
        ]),
      ]
    );
  });

  const labels = [0, 6, 12, 18].map((hour) => {
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    return svg(
      "text",
      {
        class: "ms-clock-hour",
        x: center + Math.cos(angle) * (outer + 12),
        y: center + Math.sin(angle) * (outer + 12),
      },
      [document.createTextNode(String(hour).padStart(2, "0"))]
    );
  });

  container.replaceChildren(
    svg(
      "svg",
      {
        "aria-label": `Listening by hour. Most plays happen around ${String(peak).padStart(2, "0")}:00.`,
        class: "ms-clock-svg ms-enter",
        role: "img",
        viewBox: "-6 -6 232 232",
      },
      [
        svg("circle", {
          class: "ms-clock-face",
          cx: center,
          cy: center,
          r: outer,
        }),
        ...wedges,
        ...labels,
        svg("text", { class: "ms-clock-peak", x: center, y: center - 2 }, [
          document.createTextNode(`${String(peak).padStart(2, "0")}:00`),
        ]),
        svg("text", { class: "ms-clock-caption", x: center, y: center + 16 }, [
          document.createTextNode("peak hour"),
        ]),
      ]
    )
  );
}

export function renderWeekdays(container: Element, range: RangeStats) {
  const max = Math.max(...range.weekdays, 1);
  const favourite = range.weekdays.indexOf(Math.max(...range.weekdays));

  container.replaceChildren(
    html(
      "ol",
      { "aria-label": "Plays per weekday", class: "ms-weekday-list ms-enter" },
      range.weekdays.map((count, index) =>
        html(
          "li",
          {
            class: `ms-weekday${index === favourite ? " is-favourite" : ""}`,
            style: `--value: ${count / max}; --i: ${index}`,
          },
          [
            html("span", {
              class: "ms-weekday-count",
              text: formatNumber(count),
            }),
            html("span", { "aria-hidden": "true", class: "ms-weekday-bar" }),
            html("span", { class: "ms-weekday-name", text: WEEKDAYS[index] }),
          ]
        )
      )
    )
  );
}

export function renderCalendar(
  container: Element,
  caption: Element | null,
  stats: MusicStats,
  range: RangeStats,
  { onPick }: { onPick: (date: string) => void }
) {
  const isYear = /^\d+$/.test(range.id);
  const end = isYear
    ? Date.UTC(Number(range.id), 11, 31)
    : Date.parse(`${stats.generatedAt.slice(0, 10)}T00:00:00Z`);
  const start = isYear
    ? Date.UTC(Number(range.id), 0, 1)
    : end - 364 * 86_400_000;
  // Columns start on Monday.
  const firstMonday =
    start - ((new Date(start).getUTCDay() + 6) % 7) * 86_400_000;
  const dailyStart = Date.parse(`${stats.daily.start}T00:00:00Z`);

  const days: { count: number; date: string; ms: number }[] = [];
  for (let ms = firstMonday; ms <= end; ms += 86_400_000) {
    const index = Math.round((ms - dailyStart) / 86_400_000);
    days.push({
      count: ms < start ? -1 : (stats.daily.counts[index] ?? 0),
      date: new Date(ms).toISOString().slice(0, 10),
      ms,
    });
  }

  const nonZero = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .toSorted((a, b) => a - b);
  const quantile = (q: number) =>
    nonZero[Math.floor((nonZero.length - 1) * q)] ?? 1;
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.8)];
  const level = (count: number) =>
    count <= 0
      ? 0
      : 1 + thresholds.filter((threshold) => count > threshold).length;

  const cell = 12;
  const gap = 3;
  const weeks = Math.ceil(days.length / 7);
  const width = weeks * (cell + gap);
  const height = 7 * (cell + gap) + 18;

  const rects = days.map((day, index) => {
    if (day.count < 0) return undefined;
    const week = Math.floor(index / 7);
    const weekday = index % 7;
    const label = `${formatNumber(day.count)} ${day.count === 1 ? "play" : "plays"} on ${formatDate(day.date, { weekday: "long" })}`;
    return svg(
      "rect",
      {
        "aria-disabled": day.count === 0 ? "true" : undefined,
        "aria-label": label,
        class: "ms-day",
        "data-date": day.date,
        "data-level": level(day.count),
        height: cell,
        role: "button",
        rx: 3,
        style: `--i: ${week}`,
        tabindex: -1,
        width: cell,
        x: week * (cell + gap),
        y: 18 + weekday * (cell + gap),
      },
      [svg("title", {}, [document.createTextNode(label)])]
    );
  });

  const monthLabels: SVGTextElement[] = [];
  let lastMonth = -1;
  let lastLabelWeek = -4;
  days.forEach((day, index) => {
    const month = new Date(day.ms).getUTCMonth();
    const week = Math.floor(index / 7);
    if (index % 7 !== 0 || month === lastMonth || day.ms < start) return;
    lastMonth = month;
    // A month that starts within three weeks of the last label has no room.
    if (week - lastLabelWeek < 3) return;
    lastLabelWeek = week;
    monthLabels.push(
      svg(
        "text",
        {
          class: "ms-day-month",
          x: Math.floor(index / 7) * (cell + gap),
          y: 10,
        },
        [
          document.createTextNode(
            formatDate(day.date, {
              day: undefined,
              month: "short",
              year: undefined,
            })
          ),
        ]
      )
    );
  });

  const active = days.filter((day) => day.count > 0).length;
  const total = days.reduce((sum, day) => sum + Math.max(day.count, 0), 0);
  if (caption) {
    caption.textContent = `${formatNumber(total)} plays on ${formatNumber(active)} days ${isYear ? `in ${range.id}` : "over the last year"}. Pick a day to see just that day.`;
  }

  const cells = rects.filter((rect): rect is SVGRectElement => Boolean(rect));
  const calendar = svg(
    "svg",
    {
      "aria-label": `Daily plays ${isYear ? `in ${range.id}` : "over the last year"}. Use the arrow keys to move between days and Enter to pick one.`,
      class: "ms-calendar-svg ms-enter",
      role: "group",
      viewBox: `0 0 ${width} ${height}`,
      width,
    },
    [...monthLabels, ...cells]
  );
  enableDayPicking(calendar, cells, onPick);

  container.replaceChildren(
    html(
      "div",
      {
        "aria-label": "Daily plays, scrollable",
        class: "ms-calendar-scroll",
        role: "region",
        tabindex: 0,
      },
      [calendar]
    ),
    html("div", { "aria-hidden": "true", class: "ms-legend" }, [
      html("span", { text: "Less" }),
      ...[0, 1, 2, 3, 4].map((value) =>
        html("span", { class: "ms-legend-cell", "data-level": value })
      ),
      html("span", { text: "More" }),
    ])
  );
}

/**
 * Days are picked with a click, or with the arrow keys and Enter: only one
 * day is in the tab order at a time, so the calendar is a single tab stop.
 */
function enableDayPicking(
  calendar: SVGSVGElement,
  cells: SVGRectElement[],
  onPick: (date: string) => void
) {
  const start =
    cells.findLast((cell) => cell.getAttribute("aria-disabled") !== "true") ??
    cells.at(-1);
  start?.setAttribute("tabindex", "0");

  const focus = (cell: SVGRectElement | undefined) => {
    if (!cell) return;
    for (const other of cells) other.setAttribute("tabindex", "-1");
    cell.setAttribute("tabindex", "0");
    cell.focus();
  };
  const pick = (cell: Element | null) => {
    const date = cell?.getAttribute("data-date");
    if (!date || cell?.getAttribute("aria-disabled") === "true") return;
    focus(cell as SVGRectElement);
    onPick(date);
  };

  calendar.addEventListener("click", (event) => {
    pick((event.target as Element).closest(".ms-day"));
  });
  calendar.addEventListener("keydown", (event) => {
    const current = cells.indexOf(event.target as SVGRectElement);
    if (current === -1) return;
    const steps: Record<string, number> = {
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
    };
    if (event.key in steps) {
      event.preventDefault();
      focus(cells[current + steps[event.key]!]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(cells[current] ?? null);
    }
  });
}

export function renderHighlights(container: Element, range: RangeStats) {
  const {
    busiestDay,
    evergreen,
    firstPlay,
    lastPlay,
    longestStreak,
    topRepeat,
  } = range.highlights;
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(range.id);
  const cards: HTMLElement[] = [];
  const time = (at: string) =>
    new Date(at).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Vienna",
    });

  if (isDay && firstPlay) {
    cards.push(
      renderHighlight(
        "Started with",
        firstPlay.track,
        `${firstPlay.artist ? `By ${firstPlay.artist}, at` : "At"} ${time(firstPlay.at)}.`
      )
    );
  }
  if (isDay && lastPlay && lastPlay.at !== firstPlay?.at) {
    cards.push(
      renderHighlight(
        "Ended with",
        lastPlay.track,
        `${lastPlay.artist ? `By ${lastPlay.artist}, at` : "At"} ${time(lastPlay.at)}.`
      )
    );
  }

  if (longestStreak) {
    cards.push(
      renderHighlight(
        "Longest streak",
        `${formatNumber(longestStreak.days)} days`,
        `Music every single day from ${formatDate(longestStreak.from)} to ${formatDate(longestStreak.to)}.`
      )
    );
  }
  if (busiestDay) {
    cards.push(
      renderHighlight(
        "Busiest day",
        `${formatNumber(busiestDay.plays)} plays`,
        `All on ${formatDate(busiestDay.date, { weekday: "long" })}.`
      )
    );
  }
  if (topRepeat) {
    cards.push(
      renderHighlight(
        "On repeat",
        `${formatNumber(topRepeat.plays)}×`,
        `${topRepeat.track}${topRepeat.artist ? ` by ${topRepeat.artist}` : ""}, on ${formatDate(topRepeat.date)}.`
      )
    );
  }
  if (evergreen) {
    const month = (date: string) => formatDate(date, { day: undefined });
    const span =
      month(evergreen.from) === month(evergreen.to)
        ? `in ${month(evergreen.from)}`
        : `between ${month(evergreen.from)} and ${month(evergreen.to)}`;
    cards.push(
      renderHighlight(
        "Evergreen",
        evergreen.track,
        `${evergreen.artist ? `By ${evergreen.artist}, on` : "On"} ${formatNumber(evergreen.days)} different days ${span}.`
      )
    );
  }
  if (cards.length === 0) cards.push(renderEmpty());
  cards.forEach((card, index) => card.style.setProperty("--i", String(index)));

  container.replaceChildren(...cards);
}

function renderHighlight(kicker: string, value: string, text: string) {
  return html("article", { class: "ms-highlight ms-enter" }, [
    html("span", { class: "ms-highlight-kicker", text: kicker }),
    html("span", { class: "ms-highlight-value", text: value }),
    html("p", { class: "ms-highlight-text", text }),
  ]);
}

function renderEmpty() {
  return html("p", { class: "ms-empty", text: "No plays in this period yet." });
}
