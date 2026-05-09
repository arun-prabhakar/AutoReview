const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/bg-green-500\\/10 text-green-400 border-green-500\\/20/g, 'bg-success/10 text-success border-success/20');
content = content.replace(/bg-yellow-500\\/10 text-yellow-400 border-yellow-500\\/20/g, 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20');
content = content.replace(/bg-red-500\\/10 text-red-400 border-red-500\\/20/g, 'bg-destructive/10 text-destructive border-destructive/20');
content = content.replace(/text-violet-400\\/80/g, 'text-muted-foreground');
content = content.replace(/text-sky-400\\/80/g, 'text-muted-foreground');
content = content.replace(/text-violet-400/g, 'text-foreground');
content = content.replace(/text-sky-400/g, 'text-foreground');
content = content.replace(/text-foreground\\/70/g, 'text-muted-foreground');
content = content.replace(/text-muted-foreground\\/50/g, 'text-muted-foreground');
content = content.replace(/text-muted-foreground\\/70/g, 'text-muted-foreground');
content = content.replace(/text-muted-foreground\\/30/g, 'text-muted-foreground');
content = content.replace(/shadow-lg shadow-primary\\/20/g, 'shadow-sm');
content = content.replace(/border-muted\\/50/g, 'border-border');
content = content.replace(/hover:border-muted-foreground\\/20/g, 'hover:border-border');
content = content.replace(/bg-card\\/50/g, 'bg-card');
content = content.replace(/border-muted\\/40/g, 'border-border');
content = content.replace(/border-muted\\/20/g, 'border-border');
content = content.replace(/border-muted\\/10/g, 'border-border');
content = content.replace(/hover:bg-accent\\/30/g, 'hover:bg-accent');
content = content.replace(/hover:bg-accent\\/50/g, 'hover:bg-accent');
content = content.replace(/colorFrom="hsl\\(var\\(--primary\\)\\)" colorTo="hsl\\(var\\(--primary\\) \\/ 0\\.3\\)"/g, 'colorFrom="#e5e5e5" colorTo="#e5e5e51a"');

fs.writeFileSync(path, content);
