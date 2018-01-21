'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = errorHandler;

var _errors = require('@feathersjs/errors');

var _errors2 = _interopRequireDefault(_errors);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function errorHandler(error) {
  var feathersError = error;
  if (error.name === 'CouchError') {
    var MyError = error.code === 404 || error.headers.status === 404 ? _errors2.default.NotFound : _errors2.default.GeneralError;
    feathersError = new MyError(error, {
      ok: error.ok,
      code: error.code
    });
  }

  throw feathersError;
}
module.exports = exports['default'];