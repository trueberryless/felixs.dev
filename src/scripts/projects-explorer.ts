// The projects page as something to explore: picking an organisation (its
// lane or its bubble) or a month (its bar) narrows every number, chart and
// the list of pull requests down to it. Picking it again lets go.

interface PullRequest {
  /** Merge time, `YYYY-MM-DDTHH:mm:ssZ`. */
  m: string;
  /** Organisation. */
  o: string;
  /** Repository, without the owner. */
  r: string;
  t: string;
  u: string;
}

interface ExplorerData {
  names: Record<string, string>;
  pullRequests: PullRequest[];
}

const LIST_LIMIT = 12;
const numberFormat = new Intl.NumberFormat("en-US");
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});
const dayFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

class ProjectsExplorer extends HTMLElement {
  #data: ExplorerData | undefined;
  #org: string | undefined;
  #month: string | undefined;

  connectedCallback() {
    const json = this.querySelector(".pe-data")?.textContent;
    if (!json || this.#data) return;
    this.#data = JSON.parse(json) as ExplorerData;

    this.addEventListener("click", (event) => {
      const target = event.target as Element;
      const org = target.closest<HTMLElement>(
        "[data-org].lane-label, [data-key]"
      );
      const month = target.closest<HTMLElement>(".bar[data-month]");
      if (target.closest("[data-clear]")) {
        this.#org = undefined;
        this.#month = undefined;
      } else if (org) {
        const key = org.dataset.org ?? org.dataset.key;
        this.#org = this.#org === key ? undefined : key;
      } else if (month) {
        const key = month.dataset.month;
        this.#month = this.#month === key ? undefined : key;
      } else {
        return;
      }
      this.#apply();
    });
    // The bubbles are SVG groups acting as buttons.
    this.addEventListener("keydown", (event) => {
      const bubble = (event.target as Element).closest<SVGElement>(
        "[data-key]"
      );
      if (!bubble || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      bubble.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  #apply() {
    const data = this.#data;
    if (!data) return;
    const org = this.#org;
    const month = this.#month;
    const inOrg = data.pullRequests.filter((pr) => !org || pr.o === org);
    const picked = inOrg.filter((pr) => !month || pr.m.startsWith(month));

    // Numbers
    const values: Record<string, number> = {
      months: new Set(picked.map((pr) => pr.m.slice(0, 7))).size,
      organisations: new Set(picked.map((pr) => pr.o)).size,
      pullRequests: picked.length,
      repositories: new Set(picked.map((pr) => `${pr.o}/${pr.r}`)).size,
    };
    for (const element of this.querySelectorAll<HTMLElement>("[data-stat]")) {
      const value = values[element.dataset.stat ?? ""];
      if (value !== undefined) element.textContent = numberFormat.format(value);
    }

    // Swimlanes
    const lanes = this.querySelector<HTMLElement>(".lanes");
    if (lanes) {
      toggleData(lanes, "org", org);
      toggleData(lanes, "month", month);
      for (const lane of lanes.querySelectorAll<HTMLElement>(".lane[data-org]"))
        lane.classList.toggle("is-picked", lane.dataset.org === org);
      for (const button of lanes.querySelectorAll<HTMLElement>(".lane-label"))
        button.setAttribute("aria-pressed", String(button.dataset.org === org));
      for (const dot of lanes.querySelectorAll<SVGElement>(".lane-dot"))
        dot.classList.toggle("is-picked", dot.dataset.month === month);
    }

    // Months follow the organisation that's picked.
    const perMonth = new Map<string, number>();
    for (const pr of inOrg) {
      const key = pr.m.slice(0, 7);
      perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
    }
    const max = Math.max(...perMonth.values(), 1);
    for (const bar of this.querySelectorAll<HTMLElement>(".bar[data-month]")) {
      const key = bar.dataset.month ?? "";
      const count = perMonth.get(key) ?? 0;
      bar.style.setProperty("--value", String(count / max));
      bar.setAttribute("aria-pressed", String(key === month));
      const label = `${monthFormat.format(Date.parse(`${key}-01`))}: ${count} merged pull ${count === 1 ? "request" : "requests"}`;
      bar.setAttribute("aria-label", label);
      bar.title = label;
    }

    for (const bubble of this.querySelectorAll<SVGElement>("[data-key]"))
      bubble.setAttribute("aria-pressed", String(bubble.dataset.key === org));

    // What's picked, in words, and the pull requests themselves.
    const summary = this.querySelector<HTMLElement>("[data-summary]");
    const clear = this.querySelector<HTMLElement>("[data-clear]");
    const parts = [
      org ? data.names[org] : undefined,
      month ? `in ${monthFormat.format(Date.parse(`${month}-01`))}` : undefined,
    ].filter(Boolean);
    if (summary) {
      summary.textContent = parts.length
        ? `${parts.join(" ")}: ${numberFormat.format(picked.length)} merged pull ${picked.length === 1 ? "request" : "requests"}`
        : "Everything so far. Pick an organisation or a month to look closer.";
    }
    if (clear) clear.hidden = parts.length === 0;
    this.#renderList(picked);
  }

  #renderList(picked: PullRequest[]) {
    const list = this.querySelector<HTMLElement>("[data-list]");
    const more = this.querySelector<HTMLElement>("[data-more]");
    if (!list || !this.#data) return;
    const names = this.#data.names;
    list.replaceChildren(
      ...picked.slice(0, LIST_LIMIT).map((pr, index) => {
        const item = document.createElement("li");
        item.className = "pe-item";
        item.style.setProperty("--i", String(index));
        const link = document.createElement("a");
        link.href = pr.u;
        link.className = "pe-title";
        link.textContent = pr.t;
        const meta = document.createElement("span");
        meta.className = "pe-meta";
        meta.textContent = `${names[pr.o] ?? pr.o} · ${pr.r} · ${dayFormat.format(Date.parse(pr.m))}`;
        item.append(link, meta);
        return item;
      })
    );
    if (more) {
      const rest = picked.length - LIST_LIMIT;
      more.textContent =
        picked.length === 0
          ? "Nothing merged here. Pick something else, or show everything."
          : rest > 0
            ? `And ${numberFormat.format(rest)} more.`
            : "";
    }
  }
}

function toggleData(
  element: HTMLElement,
  key: string,
  value: string | undefined
) {
  if (value) element.dataset[key] = value;
  else delete element.dataset[key];
}

if (!customElements.get("projects-explorer")) {
  customElements.define("projects-explorer", ProjectsExplorer);
}
