'use strict';

const path  = require ('path');
const util  = require ('util');
const Mocha = require ('mocha');

const script = path.resolve (process.argv[2]);

[
  'error', 'info', 'log', 'warn'
].forEach ((log) => {
  const _log = console[log];

  console[log] = function () {
    const output = util.format.apply (this, arguments);
    _log (output);

    const {stack} = new Error ();
    const line = stack
      .split ('\n')
      .filter ((line) => new RegExp (`^[ ]+at .*\\(${script}:[0-9]+:[0-9]+\\)$`, 'i').test (line))
      .map ((line) => line.replace (/.*:([0-9]+):[0-9]+[)]$/, '$1'));

    if (!line.length) {
      return;
    }

    process.send ({
      message: 'console',
      type: /(error|warn)/.test (log) ? 'stderr' : 'stdout',
      line: parseInt (line[0]),
      output
    });
  }
});

const mocha = new Mocha ({
  grep: new RegExp (process.argv[3]),
  reporter: 'min'
});

mocha.addFile (script);
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
