const fs = require('fs');
const path = 'D:/Personal/IdeaProjects/AutoReview/client/src/pages/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('color: "text-green-500"', 'color: "text-success"');

fs.writeFileSync(path, content);
