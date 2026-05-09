const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/ManualReview.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['bg-background/50', 'bg-background']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
