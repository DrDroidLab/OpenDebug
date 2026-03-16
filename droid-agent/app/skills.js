import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

const SKILLS_DIR = '/app/skills';

export async function loadSkills() {
  const skills = [];
  let items;
  try {
    items = await readdir(SKILLS_DIR);
  } catch {
    return skills;
  }
  for (const name of items) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    try {
      const fullPath = join(SKILLS_DIR, name);
      const content = await readFile(fullPath, 'utf-8');
      const stats = await stat(fullPath);
      skills.push({
        name: name.replace(/\.md$/, ''),
        content,
        size: stats.size
      });
    } catch {
      // skip unreadable files
    }
  }
  return skills;
}

export async function loadSkill(name) {
  try {
    const fullPath = join(SKILLS_DIR, `${name}.md`);
    const content = await readFile(fullPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}
