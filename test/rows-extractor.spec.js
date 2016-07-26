'use strict';

const path          = require ('path');
const {expect}      = require ('chai');
const rowsExtractor = require ('../lib/rows-extractor.js');


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
/* 25 */});
`;

describe ('rows-extractor', function () {
  it ('#byFile (regex)', function () {
    expect (rowsExtractor.byFile (path.join (__dirname, './sample.js'), 'it', /a.[0-9]/))
      .to.be.eql ([13, 14]);
  });

  it ('#byFile (string)', function () {
    expect (rowsExtractor.byFile (path.join (__dirname, './sample.js'), 'it', 'a.1'))
      .to.be.eql ([13, 14]);
  });

  it ('#byData (regex)', function () {
    expect (rowsExtractor.byData (script, 'it', /^_.*/))
      .to.be.eql ([6, 7, 9, 10, 12, 16, 17, 19, 20, 22]);
  });

  it ('#byData (string)', function () {
    expect (rowsExtractor.byData (script, 'it', '_foo'))
      .to.be.eql ([6, 7, 9, 10, 12]);
  });
});
