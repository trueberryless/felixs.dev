// The space theme's scene, styles and fonts live in their own chunk that is
// only requested once someone actually flies there.
import stylesUrl from "./cosmos.css?url";

let cosmos: Promise<typeof import("./index")> | undefined;

export const loadCosmos = () => (cosmos ??= loadInParallel());

// Starts the stylesheet download alongside the script instead of after it.
function loadInParallel() {
  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "style";
  preload.href = stylesUrl;
  document.head.append(preload);
  return import("./index");
}
