'use strict';

const path = require ('path');
const rowsExtractor = require ('./lib/rows-extractor.js');

const rows = rowsExtractor.byFile (path.join (__dirname, './test/sample.js'), /^it$/);
console.dir (rows);
