const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/ReviewDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('text-primary', 'text-foreground');

fs.writeFileSync(path, content);
