'use strict';

const path     = require ('path');
const {expect} = require ('chai');
const wannabe  = require ('../lib/index.js');


describe ('index', function () {
  it ('#default (good js)', function (done) {
    wannabe (path.join (__dirname, './sample.js'), null, 'it', 'a.1', (err, frames) => {
      expect (err).to.be.null;
      expect (frames).to.be.eql ({
        '12': [{
          name: 'test',
          value: 'foo'
        }, {
          name: 'a1',
          value: undefined
        }],
        '13': [{
          name: 'test',
          value: 'foo'
        }, {
          name: 'a1',
          value: 'foo - bar'
        }]
      });
      done ();
    });
  });

  it ('#default (bad js)', function (done) {
    wannabe (path.join (__dirname, './other.txt'), null, 'it', 'a.1', (err, frames) => {
      expect (err).to.be.not.null;
      done ();
    });
  });
});
