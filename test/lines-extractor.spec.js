'use strict';

const path           = require ('path');
const {expect}       = require ('chai');
const LinesExtractor = require ('../lib/lines-extractor.js');


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

describe ('lines-extractor', function () {
  it ('#byFuncInFile (regex)', function () {
    expect (LinesExtractor.byFuncInFile (path.join (__dirname, './sample.js'), 'it', /a.[0-9]/))
      .to.be.eql ([12, 13]);
  });

  it ('#byFuncInFile (string)', function () {
    expect (LinesExtractor.byFuncInFile (path.join (__dirname, './sample.js'), 'it', 'a.1'))
      .to.be.eql ([12, 13]);
  });

  it ('#byFuncInData (regex)', function () {
    expect (LinesExtractor.byFuncInData (script, 'it', /^_.*/))
      .to.be.eql ([6, 7, 9, 10, 12, 16, 17, 19, 20, 22]);
  });

  it ('#byFuncInData (string)', function () {
    expect (LinesExtractor.byFuncInData (script, 'it', '_foo'))
      .to.be.eql ([6, 7, 9, 10, 12]);
  });

  it ('#byLineInData', function () {
    expect (LinesExtractor.byLineInData (script, 'it', 4).lines)
      .to.be.eql ([]);
    expect (LinesExtractor.byLineInData (script, 'it', 5).lines)
      .to.be.eql ([6, 7, 9, 10, 12]);
    expect (LinesExtractor.byLineInData (script, 'it', 14).lines)
      .to.be.eql ([6, 7, 9, 10, 12]);
    expect (LinesExtractor.byLineInData (script, 'it', 22).lines)
      .to.be.eql ([16, 17, 19, 20, 22]);
    expect (LinesExtractor.byLineInData (script, 'it', 25).lines)
      .to.be.eql ([]);
  });

  it ('#_getTestName', function () {
    expect (LinesExtractor._getTestBody (script, 'it', 4).name).to.be.null;
    expect (LinesExtractor._getTestBody (script, 'it', 5).name).to.be.eql ('_foo');
    expect (LinesExtractor._getTestBody (script, 'it', 14).name).to.be.eql ('_foo');
    expect (LinesExtractor._getTestBody (script, 'it', 15).name).to.be.eql ('_bar');
    expect (LinesExtractor._getTestBody (script, 'it', 22).name).to.be.eql ('_bar');
    expect (LinesExtractor._getTestBody (script, 'it', 24).name).to.be.eql ('_bar');
    expect (LinesExtractor._getTestBody (script, 'it', 25).name).to.be.null;
  })
});
