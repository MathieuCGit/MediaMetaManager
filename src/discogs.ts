/**
 * Discogs data access and URL parsing.
 *
 * This module deliberately has no dependency on Obsidian UI classes. The HTTP
 * function is injected, which makes the module easy to test with a deterministic
 * fake response instead of making a real network request in unit tests.
 */

export type DiscogsResourceType = "artist" | "release" | "master";
export type DiscogsEntity = Record<string, unknown>;

export interface DiscogsResource {
	type: DiscogsResourceType;
	id: string;
}

export interface DiscogsHttpResponse {
	json: unknown;
}

export type DiscogsHttpRequest = (request: {
	url: string;
	headers: Record<string, string>;
}) => Promise<DiscogsHttpResponse>;

export interface DiscogsClientOptions {
	token?: string;
	userAgent?: string;
	httpRequest: DiscogsHttpRequest;
}

/**
 * Discogs uses plural collection names in its API even though public pages
 * use singular URL segments such as /release/3940534.
 */
const API_COLLECTIONS: Record<DiscogsResourceType, string> = {
	artist: "artists",
	release: "releases",
	master: "masters"
};

/**
 * Converts a public Discogs URL into the API resource that must be requested.
 *
 * The hostname check is intentionally strict enough to reject look-alike URLs,
 * while still allowing regional Discogs subdomains such as www.discogs.com.
 */
export function parseDiscogsUrl(input: string): DiscogsResource {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new Error("The Discogs URL is not valid.");
	}

	const hostname = url.hostname.toLowerCase();
	if (hostname !== "discogs.com" && !hostname.endsWith(".discogs.com")) {
		throw new Error("The URL must belong to discogs.com.");
	}

	// Discogs may include a language prefix before the resource, for example
	// /fr/release/9580817. It also commonly appends a human-readable slug after
	// the numeric ID, so both /release/123 and /release/123-some-title work.
	const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(artist|release|master)\/(\d+)(?:[-\/]|$)/i);
	if (!match) {
		throw new Error("Expected a Discogs /artist, /release, or /master URL followed by an ID.");
	}

	return {
		type: match[1].toLowerCase() as DiscogsResourceType,
		id: match[2]
	};
}

/**
 * Fetches one Discogs resource and validates that the response is JSON-like.
 *
 * Discogs accepts a personal token as a query parameter. It is never included
 * in the generated Markdown, so importing a note cannot accidentally expose it.
 */
export async function fetchDiscogsResource(
	input: string,
	options: DiscogsClientOptions
): Promise<{ resource: DiscogsResource; entity: DiscogsEntity }> {
	const resource = parseDiscogsUrl(input);
	const token = options.token?.trim();
	const query = token ? `?token=${encodeURIComponent(token)}` : "";
	const response = await options.httpRequest({
		url: `https://api.discogs.com/${API_COLLECTIONS[resource.type]}/${resource.id}${query}`,
		headers: {
			"User-Agent": options.userAgent ?? "MediaMetaManager/0.1.0"
		}
	});

	if (!isRecord(response.json)) {
		throw new Error("Discogs returned an unexpected response.");
	}

	return { resource, entity: response.json };
}

export function getDiscogsTitle(entity: DiscogsEntity, type: DiscogsResourceType): string {
	return asText(entity.title) || asText(entity.name) || `${type} ${asText(entity.id) || "unknown"}`;
}

/**
 * Returns the stable note identity used by both the filename and frontmatter.
 * Discogs release titles normally already have the "Artist - Album" shape;
 * when they do not, the artist and title are combined here.
 */
export function getDiscogsNoteName(entity: DiscogsEntity, type: DiscogsResourceType): string {
	const title = getDiscogsTitle(entity, type).trim();
	const artist = getDiscogsArtist(entity);
	const albumTitle = getDiscogsAlbumTitle(entity, type);

	if (!artist) return title;
	return `${albumTitle} - ${artist}`;
}

/** Returns the primary artist name used by the note frontmatter. */
export function getDiscogsArtist(entity: DiscogsEntity): string {
	const artists = Array.isArray(entity.artists) ? entity.artists.filter(isRecord) : [];
	return artists.length > 0 ? asText(artists[0].name).trim() : "";
}

/**
 * Extracts the album title from Discogs' usual "Artist - Album" title.
 * The fallback keeps the complete Discogs title when no artist is available.
 */
export function getDiscogsAlbumTitle(entity: DiscogsEntity, type: DiscogsResourceType): string {
	const title = getDiscogsTitle(entity, type).trim();
	const artist = getDiscogsArtist(entity);
	const prefix = artist ? `${artist} - ` : "";
	return prefix && title.startsWith(prefix) ? title.slice(prefix.length).trim() : title;
}

export function asText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function isRecord(value: unknown): value is DiscogsEntity {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
