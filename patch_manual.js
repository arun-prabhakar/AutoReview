const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/ManualReview.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['border-muted/30 bg-card/50', 'border-border bg-card'],
  ['colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.2)"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['border-muted/10', 'border-border'],
  ['border-muted/30', 'border-border'],
  ['hover:bg-muted/40', 'hover:bg-secondary'],
  ['bg-background/50 border-muted/30', 'bg-background border-border'],
  ['bg-muted/30 border border-muted/20', 'bg-secondary border border-border'],
  ['shimmerColor="rgba(129, 140, 248, 0.3)"', 'shimmerColor="rgba(115, 115, 115, 0.3)"'],
  ['border-primary/20 bg-primary/5', 'border-border bg-secondary'],
  ['colorFrom="#818cf8" colorTo="#6366f1"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20', 'bg-secondary hover:bg-secondary text-foreground border border-border']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
