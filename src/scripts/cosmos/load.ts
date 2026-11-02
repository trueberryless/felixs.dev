// The celestial theme's scene, styles and fonts live in their own chunk that is
// only requested once someone actually flies there.
let cosmos: Promise<typeof import("./index")> | undefined;

export const loadCosmos = () => (cosmos ??= import("./index"));
