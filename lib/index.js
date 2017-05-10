'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = init;

var _uberproto = require('uberproto');

var _uberproto2 = _interopRequireDefault(_uberproto);

var _feathersQueryFilters = require('feathers-query-filters');

var _feathersQueryFilters2 = _interopRequireDefault(_feathersQueryFilters);

var _errorHandler = require('./error-handler');

var _errorHandler2 = _interopRequireDefault(_errorHandler);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Service = function () {
    function Service(options) {
        _classCallCheck(this, Service);

        if (!options) {
            throw new Error('CouchDB options have to be provided');
        }

        if (!options.connection) {
            throw new Error('You must provide couchdb connection');
        }

        if (!options.Model) {
            throw new Error('You must provide a Model name');
        }

        this.id = options.id || '_id';
        this.events = options.events || [];
        this.connection = options.connection;
        this.Model = options.Model.toString().toLowerCase();
        this.paginate = options.paginate || {};

        this.db = this.database();
    }

    _createClass(Service, [{
        key: 'database',
        value: function database() {
            var db = this.connection.database(this.Model);

            return new Promise(function (resolve, reject) {
                db.exists(function (err, exists) {
                    if (err) {
                        return reject(err);
                    }

                    if (exists) {
                        resolve(db);
                    } else {
                        db.create(function (err) {
                            if (err) {
                                if (err.name === 'CouchError' && err.error === 'file_exists') {
                                    return resolve(db);
                                }

                                return reject(err);
                            }

                            resolve(db);
                        });
                    }
                });
            });
        }
    }, {
        key: 'extend',
        value: function extend(obj) {
            return _uberproto2.default.extend(obj, this);
        }
    }, {
        key: '_createMapRCondition',
        value: function _createMapRCondition(id, key, query) {
            var self = this,
                METHOD = ['$in', '$nin', '$ne', '$not', '$lt', '$lte', '$gt', '$gte'],
                COMPAT = ['.indexOf', '.indexOf', '!==', '!==', '<', '<=', '>', '>='];

            if (id === key && id === '$or') {
                var retval = '';

                for (var i = 0, N = query.length; i < N; i++) {
                    (function (obj) {
                        for (var _k in obj) {
                            retval += ' || ' + self._createMapRCondition(_k, _k, obj[_k]);
                        }
                    })(query[i]);
                }

                return '(' + retval.substr(4) + ')';
            } else if (id === key && (typeof query === 'undefined' ? 'undefined' : _typeof(query)) !== 'object') {
                return 'doc.' + id + '==' + JSON.stringify(query);
            } else {
                var arr = '';
                for (var k in query) {
                    var repl = COMPAT[METHOD.indexOf(k)];
                    var qb = 'doc.' + id + repl + query[k];
                    if (k === '$in') {
                        qb = 'RegExp(\'' + query[k].join('|') + '\',\'gi\').test(doc.' + id + ')';
                    } else if (k === '$nin') {
                        qb = '!RegExp(\'' + query[k].join('|') + '\',\'gi\').test(doc.' + id + ')';
                    }
                    arr += ' && ' + qb;
                }

                return arr.substr(4);
            }
        }

        // avoid using temporaryView CouchDB, use predefined view!

    }, {
        key: '_createTempView',
        value: function _createTempView(filters, query) {
            var self = this;
            //
            var fields = 'doc';
            if (filters.$select) {
                var obj = '_id: doc._id';
                obj += ', _rev: doc._rev';
                for (var i = 0, N = filters.$select.length; i < N; i++) {
                    obj += ', ' + filters.$select[i] + ': doc.' + filters.$select[i];
                }
                fields = '{' + obj + '}';
            }

            var conditions = 'doc';
            for (var key in query) {
                (function (k, v) {
                    conditions += ' && ' + self._createMapRCondition(k, k, v);
                })(key, query[key]);
            }

            var fnBody = '\n      if (' + conditions + ') {\n          emit(null, ' + fields + ');\n      }';

            /*jshint evil: true */
            var fn = new Function('doc', fnBody);

            var FntoString = fn.toString().replace(fn.name, '');
            fn.toString = function () {
                return FntoString.replace(/\r?\n|\/\*\*\/|  /gim, '');
            };

            return fn;
        }
    }, {
        key: 'find',
        value: function find(params) {
            var self = this;
            var paginate = params && typeof params.paginate !== 'undefined' ? params.paginate : this.paginate;

            var q = params.query.q;

            var _filter = (0, _feathersQueryFilters2.default)(params.query || {}, paginate),
                filters = _filter.filters,
                query = _filter.query;

            return this.db.then(function (db) {
                return new Promise(function (resolve, reject) {

                    var opts = {
                        limit: filters.$limit || paginate.default || 100,
                        skip: filters.$skip || 0
                    };
                    if (query.startkey) opts.startkey = query.startkey;
                    if (query.endkey) opts.endkey = query.endkey;

                    var promisify = function promisify(err, res) {
                        if (err) {
                            return reject(err);
                        }

                        for (var i = 0, N = res.length; i < N; i++) {
                            res[i] = res[i].value;
                            res[i].id = res[i]._id;
                            delete res[i]._id;
                            delete res[i]._rev;

                            var arr = filters.$select;
                            if (arr && Array.isArray(arr) && arr.length > 0) {
                                var tmpData = {};

                                for (var j = 0, _N = arr.length; j < _N; j++) {
                                    tmpData[arr[j]] = res[i][arr[j]];
                                }
                                res[i] = tmpData;
                            }
                        }

                        resolve(res);
                    };

                    if (q) {
                        return db.view(q, opts, promisify);
                    }

                    var viewFn = self._createTempView(filters, query);
                    db.temporaryView({
                        map: viewFn
                    }, function (err, res) {
                        if (err) {
                            // try to create new _design view
                            // (ie. Cloudant doesn't allow temporaryView)
                            db.save('_design/feathers', {
                                views: {
                                    temp: { map: viewFn }
                                }
                            }, function (err, obj) {
                                db.view('feathers/temp', opts, function (err, res) {
                                    if (err) {
                                        return promisify(err, res);
                                    }

                                    db.remove('_design/feathers', obj.rev, function (err) {
                                        return promisify(err, res);
                                    });
                                });
                            });
                        } else {
                            promisify(err, res);
                        }
                    });
                });
            }).catch(_errorHandler2.default);
        }
    }, {
        key: '_get',
        value: function _get(id) {
            return this.db.then(function (db) {
                return new Promise(function (resolve, reject) {
                    db.get(id, function (err, res) {
                        if (err) {
                            return reject(err);
                        }

                        resolve(res);
                    });
                });
            });
        }
    }, {
        key: 'get',
        value: function get(id, params) {
            return this._get(id, params).then(function (res) {
                var obj = Object.assign({ id: res._id }, res);
                delete obj._id;
                delete obj._rev;

                return obj;
            }).catch(_errorHandler2.default);
        }
    }, {
        key: 'create',
        value: function create(data) {
            var entry = void 0,
                _id = void 0;

            // bulk insert
            if (Array.isArray(data)) {
                var N = data.length;
                entry = new Array(N);

                for (var i = 0; i < N; i++) {
                    entry[i] = Object.assign({}, data[i]);
                }
            }

            // single doc insert
            else {
                    if (data._id || data.id) {
                        _id = data._id || data.id;
                        data.id = data._id = undefined;
                    }
                    entry = Object.assign({}, data);

                    if (_id && _id.startsWith('_design/')) {
                        _id = _id.toLowerCase();
                    }
                }

            return this.db.then(function (db) {
                return new Promise(function (resolve, reject) {
                    var promisify = function promisify(err, res) {
                        if (err) {
                            return reject(err);
                        }

                        entry.id = res.id;
                        resolve(entry);
                    };

                    _id ? db.save(_id, entry, promisify) : db.save(entry, promisify);
                });
            }).catch(_errorHandler2.default);
        }
    }, {
        key: 'patch',
        value: function patch(id, data) {
            var self = this;

            return this.db.then(function (db) {
                return new Promise(function (resolve, reject) {
                    if (data.id) {
                        delete data.id;
                    }
                    if (data._id) {
                        delete data._id;
                    }

                    var entry = Object.assign({}, data);

                    db.merge(id, entry, function (err) {
                        if (err) {
                            return reject(err);
                        }

                        resolve(self.get(id));
                    });
                });
            }).catch(_errorHandler2.default);
        }
    }, {
        key: 'update',
        value: function update(id, data, params) {
            if (!Array.isArray(data)) {
                return Promise.reject('Not replacing multiple records. Did you mean `patch`?');
            }

            var promises = new Array(data.length);
            for (var i = 0, N = data.length; i < N; i++) {
                promises[i] = this.patch(data[i]._id || data[i].id, data[i], params);
            }

            return Promise.all(promises).catch(_errorHandler2.default);
        }
    }, {
        key: 'remove',
        value: function remove(id, params) {
            var _this = this;

            var promise = void 0;
            params = params || {};

            if (!params.rev && !params._rev) {
                promise = this._get(id).then(function (doc) {
                    params.rev = doc.rev || doc._rev;
                    return _this.db;
                });
            } else {
                promise = this.db;
            }

            return promise.then(function (db) {
                return new Promise(function (resolve, reject) {
                    db.remove(id, params.rev || params._rev, function (err, res) {
                        if (err) {
                            return reject(err);
                        }

                        resolve(res);
                    });
                });
            }).catch(_errorHandler2.default);
        }
    }]);

    return Service;
}();

function init(options) {
    return new Service(options);
}

init.Service = Service;
module.exports = exports['default'];