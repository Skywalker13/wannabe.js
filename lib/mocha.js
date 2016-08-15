'use strict';

const path  = require ('path');
const Mocha = require ('mocha');

const mocha = new Mocha ({
  grep: new RegExp (process.argv[3]),
  reporter: 'min'
});

mocha.addFile (path.resolve (process.argv[2]));
const runner = mocha.run (() => process.exit (0));

runner.on ('fail', (test, err) => {
  process.send ({
    message: 'fail',
    test: {
      state:    test.state,
      title:    test.title,
      duration: test.duration,
      timedOut: test.timedOut
    },
    err
  });
});

runner.on ('pass', (test) => {
  process.send ({
    message: 'pass',
    test: {
      state:    test.state,
      title:    test.title,
      duration: test.duration,
      timedOut: test.timedOut
    }
  });
});
