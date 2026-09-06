// The registry of every supported Chinese novel site -- see
// docs/ADDING_A_SITE.md. Adding a new site: create ./<id>.ts exporting a
// SiteDefinition (copy an existing file as a template), then add it to
// the SITES array below. That's the whole registration surface.
import { sfacgSite } from "./sfacg.ts";
import { fanqieSite } from "./fanqie.ts";
import { shubaSite } from "./shuba.ts";
import type { SiteDefinition } from "./types";

const SITES: SiteDefinition[] = [sfacgSite, fanqieSite, shubaSite];

/** A SiteDefinition confirmed (by TypeScript, not just at runtime) to have a `discover` block. */
export type SiteWithDiscover = SiteDefinition & { discover: NonNullable<SiteDefinition["discover"]> };

function hasDiscover(site: SiteDefinition): site is SiteWithDiscover {
  return site.discover !== undefined;
}

/** Finds the site whose adapter can handle this URL (any page: book landing, chapter, list). */
export function resolveSite(url: string): SiteDefinition | null {
  return SITES.find((s) => s.matches(url)) ?? null;
}

/** Looks up a Discover-mode source by its stable id (the `[source]` in /surf/discover/[source]). */
export function getDiscoverSite(id: string): SiteWithDiscover | null {
  const site = SITES.find((s) => s.id === id);
  return site && hasDiscover(site) ? site : null;
}

/** Every site that offers Discover mode -- powers /surf/discover's source picker. */
export function listDiscoverSites(): SiteWithDiscover[] {
  return SITES.filter(hasDiscover);
}
