import type { MusicStats, RangeStats } from "@/lib/music";

import { formatDate, formatNumber, html, slug, svg } from "./dom";

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
          class: `ms-track ms-enter${index >= 10 ? " is-extra" : ""}`,
          style: `--i: ${Math.min(index, 12)}; --value: ${track.plays / top.plays}`,
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

  const children: Node[] = [list];
  if (range.topTracks.length > 10) {
    const button = html("button", {
      class: "ms-more",
      text: `Show all ${range.topTracks.length}`,
      type: "button",
    });
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      const isExpanded = list.classList.toggle("is-expanded");
      button.setAttribute("aria-expanded", String(isExpanded));
      button.textContent = isExpanded
        ? "Show top 10"
        : `Show all ${range.topTracks.length}`;
    });
    children.push(button);
  }

  container.replaceChildren(...children);
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
      .filter((candidate) => /^\d+$/.test(candidate.id))
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

  return keys.map((key) => {
    const date = `${key}-01`;
    return {
      artists: byMonth.get(key)?.artists.slice(0, CURRENT_ROWS) ?? [],
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

  const hint = html("span", {
    "aria-hidden": "true",
    class: "ms-currents-hint",
    text: "\u2190 Scroll for earlier",
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
  container.replaceChildren(hint, scroller);

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
    updateScrollHint(scroller);
  };
  scroller.addEventListener("scroll", () => updateScrollHint(scroller), {
    passive: true,
  });
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

function drawCurrentLines(board: HTMLElement, lines: SVGSVGElement) {
  const bounds = board.getBoundingClientRect();
  lines.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  lines.replaceChildren();

  const columns = [
    ...board.querySelectorAll<HTMLElement>(".ms-current-column"),
  ];
  columns.slice(0, -1).forEach((column, index) => {
    const next = columns[index + 1];
    if (!next) return;

    // Lines run straight out of the name, and only bend in the gutter
    // between two columns, so they never cross another artist's name.
    const gutter = column.getBoundingClientRect().right - bounds.left - 30;
    for (const from of column.querySelectorAll<HTMLElement>(".ms-current")) {
      const to = next.querySelector<HTMLElement>(
        `.ms-current[data-artist="${from.dataset.artist}"]`
      );
      if (!to) continue;

      const name = from
        .querySelector(".ms-current-name")!
        .getBoundingClientRect();
      const count = to
        .querySelector(".ms-current-count")!
        .getBoundingClientRect();
      const fromBox = from.getBoundingClientRect();
      const toBox = to.getBoundingClientRect();
      const x1 = name.right - bounds.left + 8;
      const y1 = fromBox.top + fromBox.height / 2 - bounds.top;
      const x2 = count.left - bounds.left - 6;
      const y2 = toBox.top + toBox.height / 2 - bounds.top;
      const bendStart = Math.max(x1, gutter);
      if (x2 <= bendStart) continue;

      const bend = (x2 - bendStart) / 2;
      lines.append(
        svg("path", {
          class: "ms-current-line",
          d: `M ${x1} ${y1} H ${bendStart} C ${bendStart + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
          "data-artist": from.dataset.artist,
        })
      );
    }
  });
}

function updateScrollHint(scroller: HTMLElement) {
  const hasMoreBefore = scroller.scrollLeft > 4;
  const hasMoreAfter =
    scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
  const state = [hasMoreBefore && "start", hasMoreAfter && "end"]
    .filter(Boolean)
    .join(" ");
  if (state) scroller.dataset.scroll = state;
  else delete scroller.dataset.scroll;
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
  range: RangeStats
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
    return svg(
      "rect",
      {
        class: "ms-day",
        "data-level": level(day.count),
        height: cell,
        rx: 3,
        style: `--i: ${week}`,
        width: cell,
        x: week * (cell + gap),
        y: 18 + weekday * (cell + gap),
      },
      [
        svg("title", {}, [
          document.createTextNode(
            `${formatNumber(day.count)} plays on ${formatDate(day.date)}`
          ),
        ]),
      ]
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
    caption.textContent = `${formatNumber(total)} plays on ${formatNumber(active)} days ${isYear ? `in ${range.id}` : "over the last year"}.`;
  }

  container.replaceChildren(
    html(
      "div",
      {
        "aria-label": "Daily plays, scrollable",
        class: "ms-calendar-scroll",
        role: "region",
        tabindex: 0,
      },
      [
        svg(
          "svg",
          {
            "aria-label": `Daily plays ${isYear ? `in ${range.id}` : "over the last year"}`,
            class: "ms-calendar-svg ms-enter",
            role: "img",
            viewBox: `0 0 ${width} ${height}`,
            width,
          },
          [
            ...monthLabels,
            ...rects.filter((rect): rect is SVGRectElement => Boolean(rect)),
          ]
        ),
      ]
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

export function renderHighlights(container: Element, stats: MusicStats) {
  const { busiestDay, longestStreak, topRepeat, weekObsession } =
    stats.highlights;
  const cards: HTMLElement[] = [];

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
        `${topRepeat.track} by ${topRepeat.artist}, on ${formatDate(topRepeat.date)}.`
      )
    );
  }
  if (weekObsession) {
    cards.push(
      renderHighlight(
        "This week’s obsession",
        weekObsession.track,
        `By ${weekObsession.artist}, ${formatNumber(weekObsession.plays)} plays in the last seven days.`
      )
    );
  }

  container.replaceChildren(...cards);
}

function renderHighlight(kicker: string, value: string, text: string) {
  return html("article", { class: "ms-highlight" }, [
    html("span", { class: "ms-highlight-kicker", text: kicker }),
    html("span", { class: "ms-highlight-value", text: value }),
    html("p", { class: "ms-highlight-text", text }),
  ]);
}

function renderEmpty() {
  return html("p", { class: "ms-empty", text: "No plays in this period yet." });
}
