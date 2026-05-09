const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('color: "text-red-500"', 'color: "text-destructive"');

fs.writeFileSync(path, content);
