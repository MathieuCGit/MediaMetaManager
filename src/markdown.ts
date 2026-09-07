/**
 * Markdown rendering for Discogs resources.
 *
 * This module is intentionally independent from Obsidian and from the HTTP
 * client. Its only responsibility is turning a Discogs JSON object into the
 * house note format used by the vault. Keeping this boundary pure makes the
 * output deterministic and easy to verify with unit tests.
 */

import { asText, DiscogsEntity, DiscogsResourceType, getDiscogsAlbumTitle, getDiscogsArtist, getDiscogsNoteName, isRecord } from "./discogs";

/**
 * Builds the complete note while preserving the visual structure of the
 * supplied album template: frontmatter, cover, general information, a track
 * table, companies, credits, and notes.
 */
export function buildMarkdown(
	entity: DiscogsEntity,
	type: DiscogsResourceType,
	sourceUrl: string,
	_importedAt = new Date().toISOString(),
	artistProfile?: DiscogsEntity
): string {
	// Keep note assembly in one place so every imported resource has the same
	// section order and can be compared reliably in tests or in version control.
	const noteName = getDiscogsNoteName(entity, type);
	const albumTitle = getDiscogsAlbumTitle(entity, type);
	const artistName = getDiscogsArtist(entity);
	const artist = firstRecord(entity.artists);
	const artistUrl = artist ? publicDiscogsUrl(asText(artist.resource_url) || asText(artist.uri)) : "";
	const lines = [
		"---",
		"type: album",
		`title: ${yamlScalar(albumTitle)}`,
		`artist: ${yamlScalar(artistName || "Unknown")}`,
		`artist_url: ${artistUrl}`,
		`released: ${yamlScalar(asText(entity.year) || asText(entity.released) || "")}`,
		`genre: ${yamlScalar(joinValues(entity.genres))}`,
		`style: ${yamlScalar(joinValues(entity.styles))}`,
		`label: ${yamlScalar(formatLabels(entity.labels))}`,
		`country: ${yamlScalar(asText(entity.country))}`,
		`url_source: ${sourceUrl}`,
		"---",
		`# ${noteName}`,
		"",
		formatCover(entity),
		"",
		"## General information",
		formatGeneralInformation(entity, sourceUrl),
		"",
		"## Track list",
		formatTrackTable(entity.tracklist),
		"",
		"## Companies, etc.",
		formatCompanies(entity.companies),
		"",
		"## Credits",
		formatCredits(entity.extraartists),
		"",
		"## artist",
		formatArtistProfile(artistProfile),
		"",
		"## Notes",
		formatNotes(entity.notes)
	];

	// Collapse accidental blank-line runs introduced by optional sections, then
	// always finish with one newline so the generated file is POSIX-friendly.
	return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function formatCover(entity: DiscogsEntity): string {
	// Discogs normally provides an `images` array, but `thumb` is a useful
	// fallback for artist/master responses and older API payloads.
	const images = Array.isArray(entity.images) ? entity.images : [];
	const primary = images.find(isRecord);
	const imageUrl = primary ? asText(primary.uri) || asText(primary.resource_url) : asText(entity.thumb);
	return imageUrl ? `![Pochette](${imageUrl})` : "_Aucune pochette fournie par Discogs._";
}

/**
 * Produces the same compact bullet list as the reference note. Values that
 * have a Discogs URL are rendered as links, while labels keep their catalog
 * number after the linked label name.
 */
function formatGeneralInformation(entity: DiscogsEntity, sourceUrl: string): string {
	const artist = firstRecord(entity.artists);
	const artistName = artist ? asText(artist.name) : "";
	const artistUrl = artist ? publicDiscogsUrl(asText(artist.resource_url) || asText(artist.uri)) : "";
	const year = asText(entity.year) || asText(entity.released);
	const genre = firstValue(entity.genres);
	const style = firstValue(entity.styles);
	const country = asText(entity.country);
	const label = firstRecord(entity.labels);
	const labelName = label ? asText(label.name) : "";
	const labelUrl = label ? publicDiscogsUrl(asText(label.resource_url) || asText(label.uri)) : "";
	const catalogNumber = label ? asText(label.catno) : "";

	return [
		` - artist: ${markdownLinkOrText(artistName, artistUrl)}`,
		` - released: ${markdownLinkOrText(year, year ? `https://www.discogs.com/search/?decade=${year.slice(0, 3)}0&year=${encodeURIComponent(year)}` : "")}`,
		` - genre: ${markdownLinkOrText(genre, genre ? `https://www.discogs.com/music/genre/${encodeURIComponent(genre.toLowerCase())}` : "")}`,
		` - style: ${markdownLinkOrText(style, style ? `https://www.discogs.com/music/style/${encodeURIComponent(style.toLowerCase())}` : "")}`,
		` - label: ${markdownLinkOrText(labelName, labelUrl)}${catalogNumber ? ` – ${catalogNumber}` : ""}`,
		` - country: ${markdownLinkOrText(country, country ? `https://www.discogs.com/search/?country=${encodeURIComponent(country)}` : "")}`,
		` - Source : ${markdownLinkOrText("Discogs", sourceUrl)}`
	].join("\n");
}

/**
 * Renders a stable three-column table even when a release has no durations or
 * track-level credits. Keeping the separator row fixed preserves Obsidian's
 * table parsing for all Discogs releases.
 */
function formatTrackTable(value: unknown): string {
	// Treat the API value as unknown because Discogs may omit tracklist or
	// include non-track rows. A fixed header keeps the Markdown table valid.
	const tracks = Array.isArray(value) ? value : [];
	const rows = tracks.map((item) => {
		if (!isRecord(item)) return `|  |  | ${escapeTable(String(item))} |`;
		const position = escapeTable(asText(item.position));
		const duration = escapeTable(asText(item.duration));
		const title = formatTrackTitle(item);
		return `| ${position} | ${duration} | ${title} |`;
	});
	return [
		"| Position | Duration | Title |",
		"| --- | --- | --- |",
		...(rows.length ? rows : ["|  |  | _No track supplied by Discogs._ |"])
	].join("\n");
}

/** Keeps track-specific musician roles next to the track they describe. */
function formatTrackTitle(track: DiscogsEntity): string {
	// Track-level credits are intentionally rendered beside the title. This
	// mirrors Discogs and avoids losing instrument roles that are not repeated
	// in the release-wide `extraartists` list.
	const title = escapeTable(asText(track.title) || "Untitled track");
	const credits = Array.isArray(track.extraartists)
		? track.extraartists.map(formatTrackCredit).filter(Boolean)
		: [];
	return credits.length ? `${title}<br>${credits.join("<br>")}` : title;
}

function formatTrackCredit(value: unknown): string {
	// A credit can be malformed or incomplete, so preserve a readable fallback
	// instead of dropping the entire track row.
	if (!isRecord(value)) return escapeTable(formatValue(value));
	const role = escapeTable(asText(value.role) || "Credit");
	return `${role} – ${linkedDiscogsName(value)}`;
}

/**
 * Companies use Discogs' `entity_type_name` as the left-hand role, for example
 * "Printed By" or "Record Company". Duplicate roles remain visible because
 * they can refer to different companies on a physical release.
 */
function formatCompanies(value: unknown): string {
	// Keep duplicate company roles: two companies may legitimately share the
	// same role on a physical release, such as separate manufacturing entries.
	if (!Array.isArray(value) || value.length === 0) return "_No companies supplied by Discogs._";
	return value.map((item) => {
		if (!isRecord(item)) return `- ${formatValue(item)}`;
		const role = asText(item.entity_type_name) || asText(item.role) || "Company";
		return `- ${role} – ${linkedDiscogsName(item)}`;
	}).join("\n");
}

/**
 * Credits are grouped by their Discogs role. The names remain linked to their
 * artist pages whenever Discogs provides a resource URL.
 */
function formatCredits(value: unknown): string {
	// These are release-wide credits. Track-specific credits are handled by
	// `formatTrackTitle` so the two Discogs scopes remain distinguishable.
	if (!Array.isArray(value) || value.length === 0) return "_No credits supplied by Discogs._";
	return value.map((item) => {
		if (!isRecord(item)) return `- ${formatValue(item)}`;
		const role = asText(item.role) || "Credit";
		return `- ${role} – ${linkedDiscogsName(item)}`;
	}).join("\n");
}

function formatNotes(value: unknown): string {
	// Discogs notes can contain escaped line breaks in API responses. Preserve
	// paragraph boundaries while avoiding excessive vertical whitespace.
	if (!value) return "_No notes supplied by Discogs._";
	return String(value).replace(/\\r?\\n/g, "\n\n").replace(/\n{3,}/g, "\n\n");
}

function formatArtistProfile(entity: DiscogsEntity | undefined): string {
	const profile = entity ? asText(entity.profile).trim() : "";
	if (!profile) return "_No artist profile supplied by Discogs._";

	return decodeHtmlEntities(profile)
		.replace(/\[(?:a|l)=([^\]]+)\]/gi, "$1")
		.replace(/\[(i|em)\]([\s\S]*?)\[\/\1\]/gi, "*$2*")
		.replace(/\[(b|strong)\]([\s\S]*?)\[\/\1\]/gi, "**$2**")
		.replace(/<!--\s*[\s\S]*?-->/g, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<p\b[^>]*>/gi, "")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url: string, text: string) => {
			return markdownLinkOrText(stripHtml(text).trim(), url);
		})
		.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
		.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
		.replace(/<[^>]+>/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function stripHtml(value: string): string {
	return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&nbsp;/gi, " ");
}

function linkedDiscogsName(value: DiscogsEntity): string {
	// Prefer the artist/company name, but retain a serialized value when the
	// API returns an unexpected object without a display name.
	const name = asText(value.name) || asText(value.title) || formatValue(value);
	const url = publicDiscogsUrl(asText(value.resource_url) || asText(value.uri));
	return markdownLinkOrText(name, url);
}

function markdownLinkOrText(text: string, url: string): string {
	if (!text) return "";
	return url ? `[${text}](${url})` : text;
}

function publicDiscogsUrl(url: string): string {
	// API resource URLs are not pleasant note links. Convert only known Discogs
	// API collection paths and leave unrelated URLs untouched.
	if (!url) return "";
	return url
		.replace(/^https?:\/\/api\.discogs\.com/i, "https://www.discogs.com")
		.replace(/\/(artists|releases|masters|labels)\//i, (_match, collection: string) => {
			const singular = collection.endsWith("ies")
				? `${collection.slice(0, -3)}y`
				: collection.slice(0, -1);
			return `/${singular}/`;
		});
}

function formatLabels(value: unknown): string {
	// Labels carry both a display name and a catalogue number; keeping both is
	// important when several editions share the same album title.
	const label = firstRecord(value);
	if (!label) return joinValues(value);
	const name = asText(label.name);
	const catalogNumber = asText(label.catno);
	return catalogNumber ? `${name} – ${catalogNumber}` : name;
}

function firstRecord(value: unknown): DiscogsEntity | undefined {
	// Array fields are common in the Discogs schema, but this helper also makes
	// missing or malformed fields harmless to the renderer.
	return Array.isArray(value) ? value.find(isRecord) : undefined;
}

function firstValue(value: unknown): string {
	return Array.isArray(value) ? asText(value[0]) : asText(value);
}

function joinValues(value: unknown): string {
	return Array.isArray(value) ? value.map(asText).filter(Boolean).join(", ") : asText(value);
}

function formatValue(value: unknown): string {
	// This conservative serializer is used only for malformed or unexpected
	// values, where retaining information is preferable to throwing during an
	// import.
	if (Array.isArray(value)) return value.map(formatValue).join(", ");
	if (isRecord(value)) return Object.keys(value).map((key) => `${key}: ${formatValue(value[key])}`).join("; ");
	return String(value ?? "");
}

function escapeTable(value: string): string {
	// Pipes terminate Markdown cells, and newlines would split a track across
	// multiple rows. Replace both before inserting values into the table.
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function yamlScalar(value: string): string {
	// Frontmatter values are deliberately kept on one line because this note
	// format does not emit quoted or block YAML scalars.
	return value ? value.replace(/\r?\n/g, " ") : "";
}
