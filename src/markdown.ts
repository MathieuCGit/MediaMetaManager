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
	_importedAt = new Date().toISOString()
): string {
	const noteName = getDiscogsNoteName(entity, type);
	const albumTitle = getDiscogsAlbumTitle(entity, type);
	const artistName = getDiscogsArtist(entity);
	const lines = [
		"---",
		"type: album",
		`title: ${yamlScalar(albumTitle)}`,
		`artist: ${yamlScalar(artistName || "Unknown")}`,
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
		"## Informations Générales",
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
		"## Notes",
		formatNotes(entity.notes)
	];

	return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function formatCover(entity: DiscogsEntity): string {
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
	const tracks = Array.isArray(value) ? value : [];
	const rows = tracks.map((item) => {
		if (!isRecord(item)) return `|  |  | ${escapeTable(String(item))} |`;
		const position = escapeTable(asText(item.position));
		const duration = escapeTable(asText(item.duration));
		const title = escapeTable(asText(item.title) || "Untitled track");
		return `| ${position} | ${duration} | ${title} |`;
	});
	return [
		"| Position | Duration | Title |",
		"| --- | --- | --- |",
		...(rows.length ? rows : ["|  |  | _No track supplied by Discogs._ |"])
	].join("\n");
}

/**
 * Companies use Discogs' `entity_type_name` as the left-hand role, for example
 * "Printed By" or "Record Company". Duplicate roles remain visible because
 * they can refer to different companies on a physical release.
 */
function formatCompanies(value: unknown): string {
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
	if (!Array.isArray(value) || value.length === 0) return "_No credits supplied by Discogs._";
	return value.map((item) => {
		if (!isRecord(item)) return `- ${formatValue(item)}`;
		const role = asText(item.role) || "Credit";
		return `- ${role} – ${linkedDiscogsName(item)}`;
	}).join("\n");
}

function formatNotes(value: unknown): string {
	if (!value) return "_No notes supplied by Discogs._";
	return String(value).replace(/\\r?\\n/g, "\n\n").replace(/\n{3,}/g, "\n\n");
}

function linkedDiscogsName(value: DiscogsEntity): string {
	const name = asText(value.name) || asText(value.title) || formatValue(value);
	const url = publicDiscogsUrl(asText(value.resource_url) || asText(value.uri));
	return markdownLinkOrText(name, url);
}

function markdownLinkOrText(text: string, url: string): string {
	if (!text) return "";
	return url ? `[${text}](${url})` : text;
}

function publicDiscogsUrl(url: string): string {
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
	const label = firstRecord(value);
	if (!label) return joinValues(value);
	const name = asText(label.name);
	const catalogNumber = asText(label.catno);
	return catalogNumber ? `${name} – ${catalogNumber}` : name;
}

function firstRecord(value: unknown): DiscogsEntity | undefined {
	return Array.isArray(value) ? value.find(isRecord) : undefined;
}

function firstValue(value: unknown): string {
	return Array.isArray(value) ? asText(value[0]) : asText(value);
}

function joinValues(value: unknown): string {
	return Array.isArray(value) ? value.map(asText).filter(Boolean).join(", ") : asText(value);
}

function formatValue(value: unknown): string {
	if (Array.isArray(value)) return value.map(formatValue).join(", ");
	if (isRecord(value)) return Object.keys(value).map((key) => `${key}: ${formatValue(value[key])}`).join("; ");
	return String(value ?? "");
}

function escapeTable(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function yamlScalar(value: string): string {
	return value ? value.replace(/\r?\n/g, " ") : "";
}
