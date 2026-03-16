import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, relative } from 'path';

const MEMORY_DIR = '/app/memory';

async function walkDir(dir) {
  const entries = [];
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      const subEntries = await walkDir(fullPath);
      entries.push(...subEntries);
    } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.txt'))) {
      try {
        const content = await readFile(fullPath, 'utf-8');
        const stats = await stat(fullPath);
        entries.push({
          path: relative(MEMORY_DIR, fullPath),
          content,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      } catch {
        // skip unreadable files
      }
    }
  }
  return entries;
}

export async function readAllMemory() {
  const files = await walkDir(MEMORY_DIR);
  files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return files;
}

export async function writeMemory(relativePath, content) {
  const fullPath = join(MEMORY_DIR, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
  return { path: relativePath, bytes: content.length };
}

export async function readMemory(relativePath) {
  try {
    const content = await readFile(join(MEMORY_DIR, relativePath), 'utf-8');
    return content;
  } catch {
    return null;
  }
}

export async function getMemoryTree() {
  const files = await walkDir(MEMORY_DIR);
  const tree = {};
  for (const file of files) {
    const parts = file.path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = { size: file.size, modified: file.modified };
  }
  return tree;
}

export async function getTotalMemoryBytes() {
  const files = await walkDir(MEMORY_DIR);
  return files.reduce((sum, f) => sum + f.size, 0);
}
