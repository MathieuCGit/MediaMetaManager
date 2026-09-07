import { describe, expect, it } from "vitest";
import { buildMarkdown } from "../src/markdown";

const RELEASE_URL = "https://www.discogs.com/release/3940534-Matt-Molloy-Matt-Molloy";
const KORNOG_RELEASE_URL = "https://www.discogs.com/fr/release/4445178-Kornog-Kornog";

const releasePayload = {
	id: 3940534,
	title: "Matt Molloy - Matt Molloy",
	year: 1976,
	country: "Ireland",
	genres: ["Folk, World, & Country"],
	styles: ["Celtic"],
	images: [{ uri: "https://i.discogs.com/cover.jpg" }],
	artists: [{ name: "Matt Molloy", resource_url: "https://api.discogs.com/artists/507127" }],
	tracklist: [{ position: "A1", title: "Boys Of The Lough/Tarbolton", duration: "", extraartists: [{ name: "John Engineer", role: "Engineer" }] }],
	extraartists: [
		{ name: "Matt Molloy", role: "Flute", resource_url: "https://api.discogs.com/artists/507127" },
		{ name: "John Engineer", role: "Recorded By, Mixed By", resource_url: "https://api.discogs.com/artists/123" }
	],
	labels: [{ name: "Mulligan", catno: "LUN 004", resource_url: "https://api.discogs.com/labels/169715" }],
	companies: [{ name: "Studio Example", entity_type_name: "Recorded At" }],
	notes: "Made in Ireland.\n\nOn labels, credited to Matt Molloy with Donal Lunny."
};

describe("buildMarkdown", () => {
	it("renders release metadata and musician/technical credits", () => {
		const markdown = buildMarkdown(releasePayload, "release", RELEASE_URL, "2026-09-07T00:00:00.000Z");

		expect(markdown).toContain("type: album");
		expect(markdown).toContain("title: Matt Molloy");
		expect(markdown).toContain("artist: Matt Molloy");
		expect(markdown).toContain("![Pochette](https://i.discogs.com/cover.jpg)");
		expect(markdown).toContain("# Matt Molloy - Matt Molloy");
		expect(markdown).toContain("| A1 |  | Boys Of The Lough/Tarbolton |");
		expect(markdown).toContain("- Flute – [Matt Molloy](https://www.discogs.com/artist/507127)");
		expect(markdown).toContain("- Recorded By, Mixed By – [John Engineer](https://www.discogs.com/artist/123)");
		expect(markdown).toContain("- Recorded At – Studio Example");
		expect(markdown).toContain("## Companies, etc.");
		expect(markdown).toContain("## Notes");
	});

	it("keeps the complete Discogs response available as JSON", () => {
		const markdown = buildMarkdown(releasePayload, "release", RELEASE_URL, "2026-09-07T00:00:00.000Z");

		expect(markdown).not.toContain("```json");
		expect(markdown).toContain("Made in Ireland.");
	});

	it("keeps identical artist and album names for an eponymous release", () => {
		const markdown = buildMarkdown({
			title: "Kornog - Kornog",
			artists: [{ name: "Kornog" }]
		}, "release", KORNOG_RELEASE_URL);

		expect(markdown).toContain("title: Kornog");
		expect(markdown).toContain("artist: Kornog");
		expect(markdown).toContain("# Kornog - Kornog");
	});
});
