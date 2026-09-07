/**
 * Obsidian vault persistence.
 *
 * This is the only processing module that knows about Obsidian's Vault and
 * TFile classes. UI code can call one small function without handling paths,
 * folders, or overwrite behavior itself.
 */

import { App, normalizePath, TFile } from "obsidian";

export async function writeMarkdownNote(app: App, folderInput: string, title: string, markdown: string): Promise<string> {
	const folder = normalizePath(folderInput.trim() || "Discogs");
	await ensureFolder(app, folder);

	const fileName = `${sanitizeFileName(title)}.md`;
	const path = normalizePath(`${folder}/${fileName}`);
	const existing = app.vault.getAbstractFileByPath(path);

	if (existing instanceof TFile) {
		await app.vault.modify(existing, markdown);
	} else {
		await app.vault.create(path, markdown);
	}

	return path;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	const parts = folder.split("/").filter(Boolean);
	let current = "";

	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(current)) {
			await app.vault.createFolder(current);
		}
	}
}

export function sanitizeFileName(value: string): string {
	return value
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 180) || "Discogs import";
}
