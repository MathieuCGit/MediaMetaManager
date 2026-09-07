# Media Meta Manager

An Obsidian plugin that imports Discogs metadata for an artist, album, master, or release and, overall, OTHER informations (credits, label, companies, musicians, technicians, engineer,etc.)

## Features

- Imports public Discogs URLs such as `https://www.discogs.com/release/123456`.
- Supports artist, release, and master resources.
- Fetches metadata through the Discogs API.
- Creates notes using an album-oriented Markdown template.
- Includes cover artwork, frontmatter, general information, track lists, companies, credits, and notes.
- Creates Markdown links to Discogs artists, labels, genres, styles, and countries when URLs are available.
- Stores the release information in readable sections instead of a raw JSON block.
- Creates missing output folders automatically.
- Updates an existing note when the generated filename already exists.

## Requirements

- Obsidian 1.4.0 or later.
- Node.js and npm for development builds.
- A Discogs personal token may be required when anonymous API requests are rate-limited or rejected.

## Development

Install dependencies and build the plugin:

```powershell
npm install
npm run build
```

The build runs TypeScript type checking and produces `main.js` and `main.js.map`.

Run the unit tests:

```powershell
npm test
```

The tests are located in `tests/` and use an injected HTTP client, so they do not depend on a live Discogs request.

## Installation in a Vault

1. Build the project with `npm run build`.
2. Copy the plugin folder into the vault's `.obsidian/plugins/` directory.
3. Enable **Media Meta Manager** in Obsidian's community plugins settings.
4. Reload Obsidian if the plugin does not appear immediately.

## Usage

1. Open the command palette.
2. Run **Import a Discogs URL**.
3. Paste a Discogs URL, for example:

   ```text
   https://www.discogs.com/release/3940534-Matt-Molloy-Matt-Molloy
   ```

4. Confirm the import.

By default, generated notes are stored in the `Discogs` folder. The output folder and optional Discogs token can be changed in the plugin settings.

## Project Structure

- `main.ts`: Obsidian lifecycle, command registration, modal, and settings UI.
- `src/discogs.ts`: Discogs URL parsing and API client logic.
- `src/markdown.ts`: Pure Markdown rendering logic based on the album template.
- `src/vault.ts`: Obsidian vault folder and note persistence.
- `tests/`: Unit tests for URL parsing, API requests, and Markdown rendering.

## Current Limitations

- Discogs search URLs and user profile pages are not supported.
- Importing a note with the same generated filename replaces its contents.
- Artist resources are imported as data, but the current note layout is optimized for album and release metadata.
