'use strict';

const path     = require ('path');
const {expect} = require ('chai');
const wannabe  = require ('../lib/index.js');


describe ('index', function () {
  it ('#default', function (done) {
    wannabe (path.join (__dirname, './sample.js'), 'it', 'a.1')
      .then ((frames, err) => {
        expect (err).to.be.undefined;
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
});
