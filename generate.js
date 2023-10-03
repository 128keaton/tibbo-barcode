const fs = require('fs');
var wkhtmltopdf = require('wkhtmltopdf');
wkhtmltopdf(fs.createReadStream('template.html'), { output: 'out.pdf' });



