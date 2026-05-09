const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Login.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['text-indigo-400', 'text-foreground'],
  ['bg-destructive/10', 'bg-secondary'],
  ['shimmerColor="rgba(129, 140, 248, 0.3)"', 'shimmerColor="rgba(115, 115, 115, 0.3)"']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
