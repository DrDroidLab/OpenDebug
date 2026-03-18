import { readFile, writeFile } from 'fs/promises';
import { readAllMemory } from './memory.js';
import { loadSkills } from './skills.js';

const AGENT_MD_PATH = '/app/AGENT.md';

export async function regenerateAgentMd() {
  const skills = await loadSkills();
  const memoryFiles = await readAllMemory();

  // Group memory files by directory
  const groups = {};
  for (const f of memoryFiles) {
    const slashIdx = f.path.indexOf('/');
    const dir = slashIdx !== -1 ? f.path.substring(0, slashIdx) : '/';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(f);
  }

  let md = `# AGENT.md — Droid Agent Knowledge Index

> This file is the master index of everything the agent knows. It is loaded before every request so the agent can quickly decide where to look and what context is available. Every update to memory, skills, incidents, infra, or learned patterns must update this file.

---

## Skills (${skills.length} files)

Domain knowledge and runbooks the agent uses during investigations.

| File | Size | First line |
|------|------|------------|
`;

  for (const skill of skills) {
    const firstLine = (skill.content.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').substring(0, 80);
    md += `| \`skills/${skill.name}.md\` | ${skill.size}b | ${firstLine} |\n`;
  }

  md += `\n## Memory\n\n`;

  // Root files
  if (groups['/']) {
    for (const f of groups['/']) {
      const firstLine = (f.content.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').substring(0, 80);
      md += `### ${f.path}\n${firstLine}\n\n`;
    }
  }

  // Directory groups
  const dirOrder = Object.keys(groups).filter(d => d !== '/').sort();
  for (const dir of dirOrder) {
    const files = groups[dir];
    md += `### ${dir}/ (${files.length} files)\n\n`;
    md += `| File | Size | Summary |\n|------|------|---------|\n`;
    for (const f of files) {
      const fileName = f.path.substring(dir.length + 1);
      // Extract first meaningful line or heading
      const lines = f.content.split('\n');
      let summary = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('---') && !trimmed.startsWith('|')) {
          summary = trimmed.substring(0, 100);
          break;
        }
      }
      md += `| \`${dir}/${fileName}\` | ${f.size}b | ${summary} |\n`;
    }
    md += `\n`;
  }

  md += `---

## How to use this index

- **Before investigating**: Check \`infra/summary.md\` and \`context.md\` for known infrastructure topology
- **For k8s issues**: Read \`skills/kubernetes-incidents.md\` + \`infra/kubernetes.md\`
- **For Docker issues**: Read \`skills/docker.md\` + \`infra/docker.md\`
- **For performance**: Read \`skills/performance.md\`
- **For error spikes**: Read \`skills/error-rate.md\`
- **For past incidents**: Check \`incidents/\` for similar issues and \`learned/patterns.md\` for known investigation flows
- **For general triage**: Read \`skills/general-debugging.md\`

---

*Last updated: ${new Date().toISOString()}*
`;

  await writeFile(AGENT_MD_PATH, md, 'utf-8');
  console.log(`[agent-md] Regenerated AGENT.md (${md.length} chars, ${skills.length} skills, ${memoryFiles.length} memory files)`);
  return md;
}
