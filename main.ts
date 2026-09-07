import { App, Modal, Notice, Plugin, PluginSettingTab, requestUrl, Setting } from "obsidian";
import { fetchDiscogsResource, getDiscogsNoteName } from "./src/discogs";
import { buildMarkdown } from "./src/markdown";
import { writeMarkdownNote } from "./src/vault";

interface MediaMetaManagerSettings {
	discogsToken: string;
	outputFolder: string;
}

const DEFAULT_SETTINGS: MediaMetaManagerSettings = {
	discogsToken: "",
	outputFolder: "Discogs"
};

/**
 * Obsidian integration layer.
 *
 * This class intentionally contains only plugin lifecycle, commands, settings,
 * and user notifications. Discogs parsing, rendering, and vault persistence are
 * delegated to dedicated modules so they can evolve and be tested separately.
 */
export default class MediaMetaManagerPlugin extends Plugin {
	settings: MediaMetaManagerSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "import-discogs-url",
			name: "Import a Discogs URL",
			callback: () => new DiscogsUrlModal(this.app, (url) => this.importDiscogsUrl(url)).open()
		});

		this.addSettingTab(new MediaMetaManagerSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async importDiscogsUrl(input: string): Promise<void> {
		try {
			const { resource, entity } = await fetchDiscogsResource(input, {
				token: this.settings.discogsToken,
				httpRequest: requestUrl
			});
			const markdown = buildMarkdown(entity, resource.type, input);
			const path = await writeMarkdownNote(
				this.app,
				this.settings.outputFolder,
				getDiscogsNoteName(entity, resource.type),
				markdown,
				(path) => this.confirmOverwrite(path)
			);
			if (!path) return;

			new Notice(`Discogs note imported: ${path}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Discogs import failed: ${message}`);
		}
	}

	private confirmOverwrite(path: string): Promise<boolean> {
		return new Promise((resolve) => new OverwriteModal(this.app, path, resolve).open());
	}
}

class OverwriteModal extends Modal {
	private settled = false;

	constructor(app: App, private readonly path: string, private readonly resolve: (confirmed: boolean) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Overwrite existing note?");
		this.contentEl.createEl("p", { text: `The note ${this.path} already exists.` });

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
			.addButton((button) => button.setButtonText("Overwrite").setCta().onClick(() => this.finish(true)));
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.settled) return;
		this.settled = true;
		this.resolve(false);
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}
}

/**
 * Small modal responsible only for collecting a URL from the user.
 * Validation and network work happen after the modal submits its value.
 */
class DiscogsUrlModal extends Modal {
	private url = "";

	constructor(app: App, private readonly onSubmit: (url: string) => Promise<void>) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Import from Discogs");
		const input = this.contentEl.createEl("input", {
			attr: { type: "url", placeholder: "https://www.discogs.com/release/123456..." }
		});
		input.addClass("media-meta-manager-url-input");
		input.addEventListener("input", () => { this.url = input.value; });
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") void this.submit();
		});
		input.focus();

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Import").setCta().onClick(() => void this.submit()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.url.trim()) {
			new Notice("Enter a Discogs URL.");
			return;
		}
		this.close();
		await this.onSubmit(this.url.trim());
	}
}

/**
 * Settings UI only. Persisting settings remains a plugin concern, while the
 * actual import pipeline does not need to know how these controls look.
 */
class MediaMetaManagerSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: MediaMetaManagerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Media Meta Manager" });

		new Setting(containerEl)
			.setName("Discogs token")
			.setDesc("Optional. Required when Discogs rejects anonymous API requests.")
			.addText((text) => text
				.setPlaceholder("Your token")
				.setValue(this.plugin.settings.discogsToken)
				.onChange(async (value) => {
					this.plugin.settings.discogsToken = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Vault folder where imported notes are created.")
			.addText((text) => text
				.setPlaceholder("Discogs")
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder;
					await this.plugin.saveSettings();
				}));
	}
}
