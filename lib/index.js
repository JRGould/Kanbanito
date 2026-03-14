'use strict';

const board = require('./board');
const cards = require('./cards');

module.exports = { ...board, ...cards };
