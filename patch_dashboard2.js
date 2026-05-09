const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['bg-green-500/10 text-green-400 border-green-500/20', 'bg-success/10 text-success border-success/20'],
  ['bg-yellow-500/10 text-yellow-400 border-yellow-500/20', 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'],
  ['bg-red-500/10 text-red-400 border-red-500/20', 'bg-destructive/10 text-destructive border-destructive/20'],
  ['text-violet-400/80', 'text-muted-foreground'],
  ['text-sky-400/80', 'text-muted-foreground'],
  ['text-violet-400', 'text-foreground'],
  ['text-sky-400', 'text-foreground'],
  ['text-foreground/70', 'text-muted-foreground'],
  ['text-muted-foreground/50', 'text-muted-foreground'],
  ['text-muted-foreground/70', 'text-muted-foreground'],
  ['text-muted-foreground/30', 'text-muted-foreground'],
  ['shadow-lg shadow-primary/20', 'shadow-sm'],
  ['border-muted/50', 'border-border'],
  ['hover:border-muted-foreground/20', 'hover:border-border'],
  ['bg-card/50', 'bg-card'],
  ['border-muted/40', 'border-border'],
  ['border-muted/20', 'border-border'],
  ['border-muted/10', 'border-border'],
  ['hover:bg-accent/30', 'hover:bg-accent'],
  ['hover:bg-accent/50', 'hover:bg-accent'],
  ['colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.3)"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['hover:text-destructive hover:bg-destructive/10', 'hover:text-destructive hover:bg-destructive/10']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
