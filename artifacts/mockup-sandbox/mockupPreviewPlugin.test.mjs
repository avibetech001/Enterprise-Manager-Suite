import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("preview discovery preserves nested TSX imports and excludes private files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  try {
    const mockups = path.join(root, "src/components/mockups");
    const files = [
      "Card.tsx",
      "nested/Panel.tsx",
      "_Private.tsx",
      "_private/Hidden.tsx",
      "nested/_Hidden.tsx",
      ".hidden/Hidden.tsx",
      "notes.ts",
    ];
    for (const file of files) {
      const target = path.join(mockups, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "export default function Component() { return null; }");
    }
    const plugin = mockupPreviewPlugin();
    plugin.configResolved({ root });
    await plugin.buildStart();
    const output = () => readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    const source = await output();
    assert.match(source, /"\.\/components\/mockups\/Card\.tsx"/);
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Panel\.tsx"\)/);
    assert.equal((source.match(/=> import/g) ?? []).length, 2);
    assert.doesNotMatch(source, /Private|Hidden|notes/);

    await rm(path.join(mockups, "Card.tsx"));
    await writeFile(path.join(mockups, "Added.tsx"), "export default () => null;");
    await plugin.buildStart();
    const refreshed = await output();
    assert.doesNotMatch(refreshed, /Card\.tsx/);
    assert.match(refreshed, /Added\.tsx/);
    assert.match(refreshed, /nested\/Panel\.tsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preview discovery supports a missing mockups directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-empty-"));
  try {
    const plugin = mockupPreviewPlugin();
    plugin.configResolved({ root });
    await plugin.buildStart();
    const source = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(source, /export const modules: ModuleMap = \{\n\n\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
