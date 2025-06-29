const express = require('express');
const path = require('path');
const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const port = 3001;
app.listen(port, () => console.log(`Test server listening on port ${port}`)); 