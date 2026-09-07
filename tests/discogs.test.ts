import { describe, expect, it } from "vitest";
import { fetchDiscogsArtistProfile, fetchDiscogsResource, getDiscogsAlbumTitle, getDiscogsArtist, getDiscogsNoteName, parseDiscogsUrl } from "../src/discogs";

const RELEASE_URL = "https://www.discogs.com/release/3940534-Matt-Molloy-Matt-Molloy";
const FRENCH_RELEASE_URL = "https://www.discogs.com/fr/release/9580817-Postcards-From-Mars-Growth";
const KORNOG_RELEASE = {
	title: "Kornog - Kornog",
	artists: [{ name: "Kornog" }]
};

describe("parseDiscogsUrl", () => {
	it("extracts the release ID from the supplied Matt Molloy URL", () => {
		expect(parseDiscogsUrl(RELEASE_URL)).toEqual({ type: "release", id: "3940534" });
	});

	it("extracts the release ID from a localized Discogs URL", () => {
		expect(parseDiscogsUrl(FRENCH_RELEASE_URL)).toEqual({ type: "release", id: "9580817" });
	});

	it.each([
		"https://example.com/release/3940534",
		"https://www.discogs.com/search/?q=Matt+Molloy",
		"not-a-url"
	])("rejects unsupported URL: %s", (url) => {
		expect(() => parseDiscogsUrl(url)).toThrow();
	});
});

describe("fetchDiscogsResource", () => {
	it("builds the API request and keeps the injected HTTP layer testable", async () => {
		const requests: Array<{ url: string; headers: Record<string, string> }> = [];
		const result = await fetchDiscogsResource(RELEASE_URL, {
			token: "test-token",
			httpRequest: async (request) => {
				requests.push(request);
				return { json: { id: 3940534, title: "Matt Molloy - Matt Molloy" } };
			}
		});

		expect(requests[0].url).toBe("https://api.discogs.com/releases/3940534?token=test-token");
		expect(requests[0].headers["User-Agent"]).toContain("MediaMetaManager");
		expect(result.entity.title).toBe("Matt Molloy - Matt Molloy");
	});

	it("fetches the primary artist profile referenced by a release", async () => {
		const requests: string[] = [];
		const profile = await fetchDiscogsArtistProfile({
			artists: [{ name: "John Adams", resource_url: "https://api.discogs.com/artists/144310" }]
		}, {
			httpRequest: async (request) => {
				requests.push(request.url);
				return { json: { id: 144310, name: "John Adams", profile: "A composer." } };
			}
		});

		expect(requests[0]).toBe("https://api.discogs.com/artists/144310");
		expect(profile?.profile).toBe("A composer.");
	});
});

describe("getDiscogsNoteName", () => {
	const paladinRelease = {
			title: "Paladin - Charge",
			artists: [{ name: "Paladin" }]
		};

	it("uses artist-album for the filename", () => {
		expect(getDiscogsNoteName(paladinRelease, "release")).toBe("Paladin - Charge");
	});

	it("extracts the separate artist and album property values", () => {
		expect(getDiscogsArtist(paladinRelease)).toBe("Paladin");
		expect(getDiscogsAlbumTitle(paladinRelease, "release")).toBe("Charge");
	});

	it("combines the artist and album when Discogs returns only the album title", () => {
		expect(getDiscogsNoteName({
			title: "Charge",
			artists: [{ name: "Paladin" }]
		}, "release")).toBe("Paladin - Charge");
	});

	it("keeps an eponymous first album for both artist and album", () => {
		expect(getDiscogsArtist(KORNOG_RELEASE)).toBe("Kornog");
		expect(getDiscogsAlbumTitle(KORNOG_RELEASE, "release")).toBe("Kornog");
		expect(getDiscogsNoteName(KORNOG_RELEASE, "release")).toBe("Kornog - Kornog");
	});

	it("adds the artist to the filename when Discogs returns an identical title", () => {
		const release = { title: "Kornog", artists: [{ name: "Kornog" }] };

		expect(getDiscogsAlbumTitle(release, "release")).toBe("Kornog");
		expect(getDiscogsNoteName(release, "release")).toBe("Kornog - Kornog");
	});
});
