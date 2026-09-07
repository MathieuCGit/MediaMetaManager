var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MediaMetaManagerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/discogs.ts
var API_COLLECTIONS = {
  artist: "artists",
  release: "releases",
  master: "masters"
};
function parseDiscogsUrl(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("The Discogs URL is not valid.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "discogs.com" && !hostname.endsWith(".discogs.com")) {
    throw new Error("The URL must belong to discogs.com.");
  }
  const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(artist|release|master)\/(\d+)(?:[-\/]|$)/i);
  if (!match) {
    throw new Error("Expected a Discogs /artist, /release, or /master URL followed by an ID.");
  }
  return {
    type: match[1].toLowerCase(),
    id: match[2]
  };
}
async function fetchDiscogsResource(input, options) {
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
function getDiscogsTitle(entity, type) {
  return asText(entity.title) || asText(entity.name) || `${type} ${asText(entity.id) || "unknown"}`;
}
function getDiscogsNoteName(entity, type) {
  const title = getDiscogsTitle(entity, type).trim();
  const artist = getDiscogsArtist(entity);
  const albumTitle = getDiscogsAlbumTitle(entity, type);
  if (!artist) return title;
  return `${albumTitle} - ${artist}`;
}
function getDiscogsArtist(entity) {
  const artists = Array.isArray(entity.artists) ? entity.artists.filter(isRecord) : [];
  return artists.length > 0 ? asText(artists[0].name).trim() : "";
}
function getDiscogsAlbumTitle(entity, type) {
  const title = getDiscogsTitle(entity, type).trim();
  const artist = getDiscogsArtist(entity);
  const prefix = artist ? `${artist} - ` : "";
  return prefix && title.startsWith(prefix) ? title.slice(prefix.length).trim() : title;
}
function asText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/markdown.ts
function buildMarkdown(entity, type, sourceUrl, _importedAt = (/* @__PURE__ */ new Date()).toISOString()) {
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
    "## Notes",
    formatNotes(entity.notes)
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
function formatCover(entity) {
  const images = Array.isArray(entity.images) ? entity.images : [];
  const primary = images.find(isRecord);
  const imageUrl = primary ? asText(primary.uri) || asText(primary.resource_url) : asText(entity.thumb);
  return imageUrl ? `![Pochette](${imageUrl})` : "_Aucune pochette fournie par Discogs._";
}
function formatGeneralInformation(entity, sourceUrl) {
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
    ` - label: ${markdownLinkOrText(labelName, labelUrl)}${catalogNumber ? ` \u2013 ${catalogNumber}` : ""}`,
    ` - country: ${markdownLinkOrText(country, country ? `https://www.discogs.com/search/?country=${encodeURIComponent(country)}` : "")}`,
    ` - Source : ${markdownLinkOrText("Discogs", sourceUrl)}`
  ].join("\n");
}
function formatTrackTable(value) {
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
    ...rows.length ? rows : ["|  |  | _No track supplied by Discogs._ |"]
  ].join("\n");
}
function formatCompanies(value) {
  if (!Array.isArray(value) || value.length === 0) return "_No companies supplied by Discogs._";
  return value.map((item) => {
    if (!isRecord(item)) return `- ${formatValue(item)}`;
    const role = asText(item.entity_type_name) || asText(item.role) || "Company";
    return `- ${role} \u2013 ${linkedDiscogsName(item)}`;
  }).join("\n");
}
function formatCredits(value) {
  if (!Array.isArray(value) || value.length === 0) return "_No credits supplied by Discogs._";
  return value.map((item) => {
    if (!isRecord(item)) return `- ${formatValue(item)}`;
    const role = asText(item.role) || "Credit";
    return `- ${role} \u2013 ${linkedDiscogsName(item)}`;
  }).join("\n");
}
function formatNotes(value) {
  if (!value) return "_No notes supplied by Discogs._";
  return String(value).replace(/\\r?\\n/g, "\n\n").replace(/\n{3,}/g, "\n\n");
}
function linkedDiscogsName(value) {
  const name = asText(value.name) || asText(value.title) || formatValue(value);
  const url = publicDiscogsUrl(asText(value.resource_url) || asText(value.uri));
  return markdownLinkOrText(name, url);
}
function markdownLinkOrText(text, url) {
  if (!text) return "";
  return url ? `[${text}](${url})` : text;
}
function publicDiscogsUrl(url) {
  if (!url) return "";
  return url.replace(/^https?:\/\/api\.discogs\.com/i, "https://www.discogs.com").replace(/\/(artists|releases|masters|labels)\//i, (_match, collection) => {
    const singular = collection.endsWith("ies") ? `${collection.slice(0, -3)}y` : collection.slice(0, -1);
    return `/${singular}/`;
  });
}
function formatLabels(value) {
  const label = firstRecord(value);
  if (!label) return joinValues(value);
  const name = asText(label.name);
  const catalogNumber = asText(label.catno);
  return catalogNumber ? `${name} \u2013 ${catalogNumber}` : name;
}
function firstRecord(value) {
  return Array.isArray(value) ? value.find(isRecord) : void 0;
}
function firstValue(value) {
  return Array.isArray(value) ? asText(value[0]) : asText(value);
}
function joinValues(value) {
  return Array.isArray(value) ? value.map(asText).filter(Boolean).join(", ") : asText(value);
}
function formatValue(value) {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (isRecord(value)) return Object.keys(value).map((key) => `${key}: ${formatValue(value[key])}`).join("; ");
  return String(value ?? "");
}
function escapeTable(value) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function yamlScalar(value) {
  return value ? value.replace(/\r?\n/g, " ") : "";
}

// src/vault.ts
var import_obsidian = require("obsidian");
async function writeMarkdownNote(app, folderInput, title, markdown) {
  const folder = (0, import_obsidian.normalizePath)(folderInput.trim() || "Discogs");
  await ensureFolder(app, folder);
  const fileName = `${sanitizeFileName(title)}.md`;
  const path = (0, import_obsidian.normalizePath)(`${folder}/${fileName}`);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian.TFile) {
    await app.vault.modify(existing, markdown);
  } else {
    await app.vault.create(path, markdown);
  }
  return path;
}
async function ensureFolder(app, folder) {
  const parts = folder.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
function sanitizeFileName(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || "Discogs import";
}

// main.ts
var DEFAULT_SETTINGS = {
  discogsToken: "",
  outputFolder: "Discogs"
};
var MediaMetaManagerPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "import-discogs-url",
      name: "Import a Discogs URL",
      callback: () => new DiscogsUrlModal(this.app, (url) => this.importDiscogsUrl(url)).open()
    });
    this.addSettingTab(new MediaMetaManagerSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async importDiscogsUrl(input) {
    try {
      const { resource, entity } = await fetchDiscogsResource(input, {
        token: this.settings.discogsToken,
        httpRequest: import_obsidian2.requestUrl
      });
      const markdown = buildMarkdown(entity, resource.type, input);
      const path = await writeMarkdownNote(
        this.app,
        this.settings.outputFolder,
        getDiscogsNoteName(entity, resource.type),
        markdown
      );
      new import_obsidian2.Notice(`Discogs note imported: ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian2.Notice(`Discogs import failed: ${message}`);
    }
  }
};
var DiscogsUrlModal = class extends import_obsidian2.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.url = "";
  }
  onOpen() {
    this.titleEl.setText("Import from Discogs");
    const input = this.contentEl.createEl("input", {
      attr: { type: "url", placeholder: "https://www.discogs.com/release/123456..." }
    });
    input.addClass("media-meta-manager-url-input");
    input.addEventListener("input", () => {
      this.url = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.submit();
    });
    input.focus();
    new import_obsidian2.Setting(this.contentEl).addButton((button) => button.setButtonText("Import").setCta().onClick(() => void this.submit()));
  }
  onClose() {
    this.contentEl.empty();
  }
  async submit() {
    if (!this.url.trim()) {
      new import_obsidian2.Notice("Enter a Discogs URL.");
      return;
    }
    this.close();
    await this.onSubmit(this.url.trim());
  }
};
var MediaMetaManagerSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Media Meta Manager" });
    new import_obsidian2.Setting(containerEl).setName("Discogs token").setDesc("Optional. Required when Discogs rejects anonymous API requests.").addText((text) => text.setPlaceholder("Your token").setValue(this.plugin.settings.discogsToken).onChange(async (value) => {
      this.plugin.settings.discogsToken = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Output folder").setDesc("Vault folder where imported notes are created.").addText((text) => text.setPlaceholder("Discogs").setValue(this.plugin.settings.outputFolder).onChange(async (value) => {
      this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder;
      await this.plugin.saveSettings();
    }));
  }
};
//# sourceMappingURL=main.js.map
