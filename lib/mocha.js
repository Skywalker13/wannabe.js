'use strict';

const path  = require ('path');
const Mocha = require ('mocha');

const mocha = new Mocha ({
  grep: new RegExp (process.argv[3]),
  reporter: 'min'
});

mocha.addFile (path.resolve (process.argv[2]));
mocha.run (() => process.exit (0));
