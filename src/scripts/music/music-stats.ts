import type { MusicStats, RangeStats } from "@/lib/music";
import { countTo } from "@/scripts/count-up";
import "@/scripts/edge-scroll";

import { formatDate, reveal } from "./dom";
import { renderTrack } from "./track";
import {
  getCurrentColumns,
  renderArtists,
  renderCalendar,
  renderClock,
  renderCurrents,
  renderHighlights,
  renderTracks,
  renderWeekdays,
} from "./views";

/**
 * Enhances the server-rendered music stats: views re-render from the embedded
 * data per range, and a picked day is fetched on demand.
 */
class MusicStatsElement extends HTMLElement {
  #stats: MusicStats | undefined;
  #range: RangeStats | undefined;
  #days = new Map<string, Promise<RangeStats>>();
  #request = 0;

  connectedCallback() {
    const data = this.querySelector(".ms-data")?.textContent;
    if (!data || this.#stats) return;
    this.#stats = JSON.parse(data) as MusicStats;

    this.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === "music-range") this.#pick(input.value);
    });
    for (const toggle of this.querySelectorAll<HTMLButtonElement>(
      ".ms-range-toggle"
    )) {
      toggle.addEventListener("click", () => {
        const group = toggle.closest<HTMLElement>(".ms-range-group");
        if (group) this.#openGroup(group.dataset.group);
      });
    }
    this.querySelector(".ms-range-day-close")?.addEventListener("click", () =>
      this.#pick(this.#range?.id ?? this.dataset.defaultRange ?? "all")
    );

    this.classList.add("is-enhanced");
    this.#pick(this.dataset.defaultRange ?? "all", { isFirst: true });

    // Prefetch the latest day with plays, which also warms its month on the
    // server.
    const { counts, start } = this.#stats.daily;
    const lastIndex = counts.findLastIndex((count) => count > 0);
    if (lastIndex !== -1) {
      const date = new Date(
        Date.parse(`${start}T00:00:00Z`) + lastIndex * 86_400_000
      )
        .toISOString()
        .slice(0, 10);
      const warm = () => void this.#fetchDay(date).catch(() => undefined);
      if ("requestIdleCallback" in window)
        requestIdleCallback(warm, { timeout: 4000 });
      else setTimeout(warm, 2000);
    }

    const recent = this.querySelector<HTMLElement>(".ms-recent");
    const { did, nowPlaying, pds } = this.dataset;
    if (recent && did && pds) renderTrack(recent, { did, nowPlaying, pds });
  }

  /** Shows one of the precomputed ranges. */
  #pick(id: string, { isFirst = false } = {}) {
    const stats = this.#stats;
    const range = stats?.ranges.find((candidate) => candidate.id === id);
    if (!stats || !range) return;

    this.#request++;
    this.#range = range;
    this.removeAttribute("data-loading");
    this.removeAttribute("aria-busy");
    const input = this.querySelector<HTMLInputElement>(
      `input[name="music-range"][value="${id}"]`
    );
    if (input) input.checked = true;
    this.#setDay(undefined);
    this.#openGroup(/^\d+$/.test(id) ? "year" : "relative", {
      animate: !isFirst,
    });

    this.#renderRange(range, { isFirst });
    this.#render(".ms-calendar", (element) =>
      renderCalendar(
        element,
        this.querySelector(".ms-calendar-caption"),
        stats,
        range,
        {
          onIntent: (date) => void this.#fetchDay(date).catch(() => undefined),
          onPick: (date) => void this.#pickDay(date),
        }
      )
    );
    if (!isFirst) reveal(this.querySelector(".ms-calendar"), 5);
  }

  /** Fetches and shows a single day, keeping the calendar where it is. */
  async #pickDay(date: string) {
    const request = ++this.#request;
    for (const input of this.querySelectorAll<HTMLInputElement>(
      'input[name="music-range"]'
    )) {
      input.checked = false;
    }
    this.#setDay(date);
    this.#announce(`Loading the plays of ${formatDate(date)}.`);
    this.toggleAttribute("data-loading", true);
    this.setAttribute("aria-busy", "true");

    let day: RangeStats | undefined;
    try {
      day = await this.#fetchDay(date);
    } catch {
      day = undefined;
    }
    if (request !== this.#request) return;

    this.removeAttribute("data-loading");
    this.removeAttribute("aria-busy");
    if (!day) {
      this.#announce(`The plays of ${formatDate(date)} couldn't be loaded.`);
      if (this.#range) this.#pick(this.#range.id);
      return;
    }

    this.#keepInPlace(".ms-calendar", () => this.#renderRange(day));
    this.#announce(
      `Showing ${formatDate(date)}: ${day.plays} ${day.plays === 1 ? "play" : "plays"}.`
    );
  }

  #fetchDay(date: string): Promise<RangeStats> {
    let day = this.#days.get(date);
    if (!day) {
      day = fetch(`/api/music/${date}`).then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<RangeStats>;
      });
      day.catch(() => this.#days.delete(date));
      this.#days.set(date, day);
    }
    return day;
  }

  #renderRange(range: RangeStats, { isFirst = false } = {}) {
    const stats = this.#stats;
    if (!stats) return;
    const isDay = /^\d{4}-\d{2}-\d{2}$/.test(range.id);

    this.#renderNumbers(range);
    this.#render(".ms-artists", (element) => renderArtists(element, range));
    this.#render(".ms-tracks", (element) => renderTracks(element, range));

    // A single day has no months to follow artists through.
    const currents = this.querySelector<HTMLElement>(".ms-currents-section");
    if (currents) currents.hidden = isDay;
    if (!isDay) {
      this.#render(".ms-currents", (element) =>
        renderCurrents(element as HTMLElement, getCurrentColumns(stats, range))
      );
    }

    this.#render(".ms-clock", (element) => renderClock(element, range));
    const weekdays = this.querySelector<HTMLElement>(".ms-weekdays");
    if (weekdays) {
      weekdays.hidden = isDay;
      if (!isDay) renderWeekdays(weekdays, range);
    }
    this.#render(".ms-highlights", (element) =>
      renderHighlights(element, range)
    );

    if (isFirst) {
      [...this.children]
        // The number cards rise in on their own, like on every page.
        .filter(
          (element) => !element.matches("script, [data-status], .number-cards")
        )
        .forEach((element, index) => reveal(element, Math.min(index, 6)));
      return;
    }
    [
      ".ms-artists",
      ".ms-tracks",
      ".ms-currents",
      ".ms-rhythm-grid",
      ".ms-highlights",
    ].forEach((selector, index) => {
      reveal(this.querySelector(selector), index);
    });
  }

  #renderNumbers(range: RangeStats) {
    for (const key of ["minutes", "plays", "artists", "tracks"] as const) {
      const element = this.querySelector(`[data-stat="${key}"]`);
      if (element) countTo(element, range[key]);
    }
  }

  #render(selector: string, render: (element: Element) => void) {
    const element = this.querySelector(selector);
    if (element) render(element);
  }

  /** Expands one group of ranges and folds the other into a single button. */
  #openGroup(name: string | undefined, { animate = true } = {}) {
    for (const group of this.querySelectorAll<HTMLElement>(".ms-range-group")) {
      const isOpen = group.dataset.group === name;
      const toggle = group.querySelector<HTMLButtonElement>(".ms-range-toggle");
      const options = group.querySelector<HTMLElement>(".ms-range-options");
      if (!toggle || !options) continue;
      const wasOpen = group.classList.contains("is-open") && !options.hidden;
      group.classList.toggle("is-open", isOpen);

      toggle.setAttribute("aria-expanded", String(isOpen));
      options.inert = !isOpen;
      // A folded group still shows its range when it's the picked one.
      const checked = group.querySelector<HTMLInputElement>("input:checked");
      const label = isOpen
        ? undefined
        : checked?.nextElementSibling?.textContent;
      toggle.textContent = label ?? toggle.dataset.label ?? "";
      toggle.classList.toggle("is-picked", Boolean(label));

      if (isOpen === wasOpen && toggle.hidden === isOpen) continue;
      const move = animate && !reducedMotion();
      setShown(options, isOpen, move);
      setShown(toggle, !isOpen, move);
    }
  }

  #setDay(date: string | undefined) {
    const day = this.querySelector<HTMLElement>(".ms-range-day");
    const label = this.querySelector(".ms-range-day-label");
    if (day && label) {
      day.hidden = !date;
      if (date) {
        label.textContent = formatDate(date);
        this.#openGroup(undefined);
      }
    }
    for (const cell of this.querySelectorAll(".ms-day")) {
      cell.classList.toggle(
        "is-selected",
        cell.getAttribute("data-date") === date
      );
    }
  }

  #announce(message: string) {
    const status = this.querySelector("[data-status]");
    if (status) status.textContent = message;
  }

  /**
   * Re-renders without moving the element in view, even if sections above
   * resize.
   */
  #keepInPlace(selector: string, update: () => void) {
    const anchor = this.querySelector(selector);
    const before = anchor?.getBoundingClientRect().top;
    update();
    const after = anchor?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && before !== after) {
      window.scrollBy({ behavior: "instant", top: after - before });
    }
  }
}

const FOLD_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FOLD_MS = 420;
const folds = new WeakMap<Element, Animation>();

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shows or hides an element by unfolding or folding its width. */
function setShown(element: HTMLElement, shown: boolean, animate: boolean) {
  folds.get(element)?.cancel();
  if (!animate) {
    element.hidden = !shown;
    return;
  }

  // The padding folds with the width, so nothing jumps when it's hidden.
  element.hidden = false;
  const style = getComputedStyle(element);
  const open = {
    opacity: 1,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    width: `${element.scrollWidth}px`,
  };
  const closed = {
    opacity: 0,
    paddingLeft: "0px",
    paddingRight: "0px",
    width: "0px",
  };
  const fold = element.animate(shown ? [closed, open] : [open, closed], {
    duration: shown ? FOLD_MS : FOLD_MS * 0.85,
    easing: FOLD_EASING,
    fill: shown ? "none" : "forwards",
  });
  folds.set(element, fold);
  if (shown) return;
  fold.onfinish = () => {
    element.hidden = true;
    fold.cancel();
  };
}

if (!customElements.get("music-stats")) {
  customElements.define("music-stats", MusicStatsElement);
}
