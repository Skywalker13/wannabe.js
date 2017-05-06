'use strict';
/* jshint -W030 */

const path = require ('path');
const {expect} = require ('chai');
const Extractor = require ('../lib/extractor.js');

const script = `/*  1 */
/*  2 */ 'use strict';
/*  3 */
/*  4 */describe ('foobar', function () {
/*  5 */  it ('_foo', function () {
/*  6 */    const a = true;
/*  7 */    if (true) {
/*  8 */      // foo
/*  9 */      foo ();
/* 10 */    } else {
/* 11 */      // bar
/* 12 */      bar ();
/* 13 */    }
/* 14 */  });
/* 15 */  it ('_bar', () => {
/* 16 */    const a = true;
/* 17 */    if (true) {
/* 18 */      // foo
/* 19 */      foo ();
/* 20 */    } else {
/* 21 */      // bar
/* 22 */      bar ();
/* 23 */    }
/* 24 */  });
/* 25 */  it ('_toto', () => {
/* 26 */    const a = true;
/* 27 */    try {
/* 28 */      // foo
/* 29 */      foo ();
/* 30 */    } catch (ex) {
/* 31 */      // bar
/* 32 */      let a = 2;
/* 33 */    }
/* 34 */  });
/* 35 */});
`;

describe ('extractor', function () {
  it ('#byFuncInFile (regex)', function () {
    const extractor = new Extractor ();
    expect (
      extractor.byFuncInFile (
        path.join (__dirname, './sample.js'),
        /^it$/,
        /a.[0-9]/
      ).lines
    ).to.be.eql ({14: 13, 15: 13});
  });

  it ('#byFuncInFile (string)', function () {
    const extractor = new Extractor ();
    expect (
      extractor.byFuncInFile (
        path.join (__dirname, './sample.js'),
        /^it$/,
        'a.1'
      ).lines
    ).to.be.eql ({14: 13, 15: 13});
  });

  it ('#byFuncInData (regex)', function () {
    let lines = 0;
    const extractor = new Extractor ();

    lines = extractor.byFuncInData (script, /^it$/, /^_.*/).lines;
    expect (lines).to.be.eql ({
      6: 5,
      7: 5,
      9: 5,
      10: 5,
      12: 5,
      16: 15,
      17: 15,
      19: 15,
      20: 15,
      22: 15,
      26: 25,
      27: 25,
      29: 25,
      30: 25,
      32: 25,
    });
  });

  it ('#byFuncInData (string)', function () {
    let lines = 0;
    const extractor = new Extractor ();

    lines = extractor.byFuncInData (script, /^it$/, '_foo').lines;
    expect (lines).to.be.eql ({
      6: 5,
      7: 5,
      9: 5,
      10: 5,
      12: 5,
    });
  });

  it ('#byLineInData', function () {
    let lines = 0;
    const extractor = new Extractor ();

    lines = extractor.byLineInData (script, /^it$/, 4).lines;
    expect (lines).to.be.eql ({});

    lines = extractor.byLineInData (script, /^it$/, 5).lines;
    expect (lines).to.be.eql ({
      6: 5,
      7: 5,
      9: 5,
      10: 5,
      12: 5,
    });

    lines = extractor.byLineInData (script, /^it$/, 14).lines;
    expect (lines).to.be.eql ({
      6: 5,
      7: 5,
      9: 5,
      10: 5,
      12: 5,
    });

    lines = extractor.byLineInData (script, /^it$/, 22).lines;
    expect (lines).to.be.eql ({
      16: 15,
      17: 15,
      19: 15,
      20: 15,
      22: 15,
    });

    lines = extractor.byLineInData (script, /^it$/, 35).lines;
    expect (lines).to.be.eql ({});
  });

  it ('#_getTestName', function () {
    let name = '';
    const extractor = new Extractor ();

    name = extractor._getTestBody (script, /^it$/, 4).name;
    expect (name).to.be.null;

    name = extractor._getTestBody (script, /^it$/, 5).name;
    expect (name).to.be.eql ('_foo');

    name = extractor._getTestBody (script, /^it$/, 14).name;
    expect (name).to.be.eql ('_foo');

    name = extractor._getTestBody (script, /^it$/, 15).name;
    expect (name).to.be.eql ('_bar');

    name = extractor._getTestBody (script, /^it$/, 22).name;
    expect (name).to.be.eql ('_bar');

    name = extractor._getTestBody (script, /^it$/, 24).name;
    expect (name).to.be.eql ('_bar');

    name = extractor._getTestBody (script, /^it$/, 35).name;
    expect (name).to.be.null;
  });
});
