import type { MusicStats, RangeStats } from "@/lib/music";

import { animateNumber, describeMinutes } from "./dom";
import {
  getCurrentColumns,
  renderArtists,
  renderCalendar,
  renderClock,
  renderCurrents,
  renderHighlights,
  renderRecent,
  renderTracks,
  renderWeekdays,
} from "./views";

/**
 * Enhances the server-rendered music stats: every view is re-rendered from
 * the embedded data whenever another time range is picked.
 */
class MusicStatsElement extends HTMLElement {
  #stats: MusicStats | undefined;

  connectedCallback() {
    const data = this.querySelector(".ms-data")?.textContent;
    if (!data || this.#stats) return;
    this.#stats = JSON.parse(data) as MusicStats;

    this.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === "music-range") this.#show(input.value);
    });

    this.classList.add("is-enhanced");
    this.#show(this.dataset.defaultRange ?? "all");

    const highlights = this.querySelector(".ms-highlights");
    if (highlights) renderHighlights(highlights, this.#stats);

    const recent = this.querySelector(".ms-recent");
    const { did, pds } = this.dataset;
    if (recent && did && pds) void renderRecent(recent, pds, did);
  }

  #show(id: string) {
    const stats = this.#stats;
    const range = stats?.ranges.find((candidate) => candidate.id === id);
    if (!stats || !range) return;

    this.#renderNumbers(range);
    this.#render(".ms-artists", (element) => renderArtists(element, range));
    this.#render(".ms-tracks", (element) => renderTracks(element, range));
    this.#render(".ms-currents", (element) =>
      renderCurrents(element as HTMLElement, getCurrentColumns(stats, range))
    );
    this.#render(".ms-clock", (element) => renderClock(element, range));
    this.#render(".ms-weekdays", (element) => renderWeekdays(element, range));
    this.#render(".ms-calendar", (element) =>
      renderCalendar(
        element,
        this.querySelector(".ms-calendar-caption"),
        stats,
        range
      )
    );
  }

  #renderNumbers(range: RangeStats) {
    for (const key of ["minutes", "plays", "artists", "tracks"] as const) {
      const element = this.querySelector(`[data-stat="${key}"]`);
      if (element) animateNumber(element, range[key]);
    }

    const hint = this.querySelector('[data-stat="minutes-hint"]');
    if (hint) hint.textContent = describeMinutes(range.minutes);
  }

  #render(selector: string, render: (element: Element) => void) {
    const element = this.querySelector(selector);
    if (element) render(element);
  }
}

if (!customElements.get("music-stats")) {
  customElements.define("music-stats", MusicStatsElement);
}
