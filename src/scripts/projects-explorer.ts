// The projects page as something to explore: picking an organisation (its
// lane or its bubble) or a month (its bar) narrows every number, chart and
// the list of pull requests down to it. Picking it again lets go.
import { packBubbles } from "@/lib/bubbles";
import { countTo } from "@/scripts/count-up";

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
  avatars: Record<string, string>;
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

    const values: Record<string, number> = {
      months: new Set(picked.map((pr) => pr.m.slice(0, 7))).size,
      organisations: new Set(picked.map((pr) => pr.o)).size,
      pullRequests: picked.length,
      repositories: new Set(picked.map((pr) => `${pr.o}/${pr.r}`)).size,
    };
    for (const element of this.querySelectorAll<HTMLElement>("[data-stat]")) {
      const value = values[element.dataset.stat ?? ""];
      if (value !== undefined) countTo(element, value);
    }

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

    this.#packBubbles(month);

    const summary = this.querySelector<HTMLElement>("[data-summary]");
    const parts = [
      org ? data.names[org] : undefined,
      month ? `in ${monthFormat.format(Date.parse(`${month}-01`))}` : undefined,
    ].filter(Boolean);
    if (summary) {
      summary.textContent = parts.length
        ? `${parts.join(" ")}: ${numberFormat.format(picked.length)} merged pull ${picked.length === 1 ? "request" : "requests"}`
        : "Showing everything.";
    }
    for (const clear of this.querySelectorAll<HTMLElement>("[data-clear]")) {
      clear.hidden = parts.length === 0;
    }
    this.#renderList(picked);
  }

  // A month repacks the bubbles to that month only: they glide and grow to
  // their new places, and their labels come back once they've settled.
  #packBubbles(month: string | undefined) {
    const data = this.#data;
    const chart = this.querySelector<SVGSVGElement>(".bubble-chart");
    if (!data || !chart) return;

    const counts = new Map<string, number>();
    for (const pr of data.pullRequests) {
      if (month && !pr.m.startsWith(month)) continue;
      counts.set(pr.o, (counts.get(pr.o) ?? 0) + 1);
    }
    const [, , width = 300, height = 300] = (
      chart.getAttribute("viewBox") ?? ""
    )
      .split(" ")
      .map(Number);
    const packed = new Map(
      packBubbles(
        [...counts].map(([key, value]) => ({
          key,
          label: data.names[key] ?? key,
          title: `${data.names[key] ?? key}: ${value} merged pull ${value === 1 ? "request" : "requests"}`,
          value,
        })),
        {
          height,
          scale: chart.dataset.scale === "sqrt" ? "sqrt" : "linear",
          width,
        }
      ).map((bubble) => [bubble.key, bubble])
    );

    chart.classList.add("is-moving");
    for (const group of chart.querySelectorAll<SVGGElement>("[data-key]")) {
      const bubble = packed.get(group.dataset.key ?? "");
      const circle = group.querySelector<SVGCircleElement>(".bubble");
      if (!circle) continue;
      circle.style.setProperty("cx", `${bubble?.x ?? width / 2}px`);
      circle.style.setProperty("cy", `${bubble?.y ?? height / 2}px`);
      circle.style.setProperty("r", `${bubble?.r ?? 0}px`);
      group.toggleAttribute("inert", !bubble);
      if (bubble) {
        group.dataset.tip = bubble.title;
        group.setAttribute("aria-label", bubble.title);
      }
    }

    clearTimeout(this.#settle);
    this.#settle = window.setTimeout(() => {
      for (const group of chart.querySelectorAll<SVGGElement>("[data-key]")) {
        const bubble = packed.get(group.dataset.key ?? "");
        const text = group.querySelector(".bubble-text");
        // Spaces between the lines keep them apart as words when read out.
        const parts = bubble
          ? renderLabel(bubble).flatMap((part, index) =>
              index === 0 ? [part] : [document.createTextNode(" "), part]
            )
          : [];
        if (text) text.replaceChildren(...parts);
      }
      chart.classList.remove("is-moving");
    }, 450);
  }

  #settle = 0;

  #renderList(picked: PullRequest[]) {
    const list = this.querySelector<HTMLElement>("[data-list]");
    const more = this.querySelector<HTMLElement>("[data-more]");
    if (!list || !this.#data) return;
    const { avatars } = this.#data;
    list.replaceChildren(
      ...picked.slice(0, LIST_LIMIT).map((pr, index) => {
        const item = document.createElement("li");
        item.className = "pe-item";
        item.style.setProperty("--i", String(index));
        const avatar = document.createElement("img");
        avatar.className = "pe-avatar";
        avatar.alt = "";
        avatar.width = 20;
        avatar.height = 20;
        if (avatars[pr.o]) avatar.src = avatars[pr.o] ?? "";
        const link = document.createElement("a");
        link.href = pr.u;
        link.className = "pe-title";
        link.textContent = pr.t;
        const repo = document.createElement("span");
        repo.className = "pe-repo";
        repo.textContent = pr.r;
        const date = document.createElement("time");
        date.className = "pe-date";
        date.dateTime = pr.m;
        date.textContent = dayFormat.format(Date.parse(pr.m));
        item.append(avatar, link, repo, date);
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

const SVG_NS = "http://www.w3.org/2000/svg";
const compact = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

/** The same label as the server renders, for a repacked bubble. */
function renderLabel(bubble: ReturnType<typeof packBubbles>[number]) {
  const lines = bubble.lines ?? [];
  const showValue = lines.length > 0 && bubble.r > 34;
  const lineHeight = bubble.size * 1.15;
  const firstY =
    bubble.y -
    (lines.length * lineHeight + (showValue ? 13 : 0)) / 2 +
    lineHeight / 2;
  const texts = lines.map((line, index) => {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "bubble-label");
    text.setAttribute("x", String(bubble.x));
    text.setAttribute("y", String(firstY + index * lineHeight));
    text.style.fontSize = `${bubble.size.toFixed(1)}px`;
    text.textContent = line;
    return text;
  });
  if (showValue) {
    const value = document.createElementNS(SVG_NS, "text");
    value.setAttribute("class", "bubble-value");
    value.setAttribute("x", String(bubble.x));
    value.setAttribute("y", String(firstY + lines.length * lineHeight + 2));
    value.textContent = compact.format(bubble.value);
    texts.push(value);
  }
  return texts;
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
