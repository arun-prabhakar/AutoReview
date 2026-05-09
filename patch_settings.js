const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Settings.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.2)"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['bg-muted/40', 'bg-secondary']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
