const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/ReviewDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  ['bg-red-500/10 text-red-400 border-red-500/20', 'bg-destructive/10 text-destructive border-destructive/20'],
  ['bg-yellow-500/10 text-yellow-400 border-yellow-500/20', 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'],
  ['bg-gray-500/10 text-gray-400 border-gray-500/20', 'bg-secondary text-muted-foreground border-border'],
  ['border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive', 'border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive'],
  ['border-muted/50 bg-card/50 hover:bg-accent/50', 'border-border bg-card hover:bg-accent'],
  ['border-muted/30 bg-card/40', 'border-border bg-card'],
  ['colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.2)"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['border-red-500/10 bg-red-500/5', 'border-border bg-secondary'],
  ['colorFrom="#ef4444" colorTo="#dc2626"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['text-red-500/60', 'text-destructive'],
  ['text-red-500', 'text-destructive'],
  ['border-yellow-500/10 bg-yellow-500/5', 'border-border bg-secondary'],
  ['colorFrom="#eab308" colorTo="#ca8a04"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['text-yellow-500/60', 'text-yellow-600'],
  ['text-yellow-500', 'text-yellow-600'],
  ['border-muted/10 bg-muted/5', 'border-border bg-secondary'],
  ['colorFrom="hsl(var(--muted-foreground))" colorTo="hsl(var(--muted))"', 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"'],
  ['border-muted-foreground/20', 'border-border'],
  ['border-muted/30 hover:border-muted/50', 'border-border hover:border-border'],
  ['bg-muted/10', 'bg-secondary'],
  ['text-primary font-mono bg-primary/5', 'text-foreground font-mono bg-secondary'],
  ['border-muted/30', 'border-border'],
  ['bg-muted/30 p-4 border border-muted/20', 'bg-secondary p-4 border border-border'],
  ['text-primary/70', 'text-foreground'],
  ['bg-primary/10', 'bg-border'],
  ['border-muted/10', 'border-border'],
  ['bg-muted/50', 'bg-secondary']
];

for (const [oldStr, newStr] of replacements) {
  content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(path, content);
