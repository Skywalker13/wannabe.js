'use strict';

const path     = require ('path');
const {expect} = require ('chai');
const wannabe  = require ('../lib/index.js');


describe ('index', function () {
  it ('#default', function () {
    wannabe (path.join (__dirname, './sample.js'), 'it', 'a.1')
      .then ((frames, err) => {
        expect (err).to.be.undefined;
        expect (frames).to.be.eql ({
          '12': {
            name: 'foo',
            value: undefined
          },
          '13': {
            name: 'foo',
            value: 'foo - bar'
          }
        });
      });
  });
});
