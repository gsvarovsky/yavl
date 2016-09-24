var _ = require('lodash');

/**
 * Main entry point for schema interpretation into a checker.
 * Each passed argument represents a data type, which are logically OR-ed.
 * @see https://github.com/Framespaces/yavl for the available data types and checker methods.
 * @param what... the data types
 * @return an interpreted schema checker with the methods: matches, coerce and validate
 */
var as = module.exports = function as(what/*, ...*/) {
  if (arguments.length > 0) {
    if (arguments.length === 1) {
      return as1(what);
    } else {
      return as1(arguments[0]).or([].slice.call(arguments, 1));
    }
  } else {
    return as;
  }
}

function as1(what) {
  switch (what) {
  case Error: return as.error;
  case Array: return as.array;
  case Object: return as.object;
  case Boolean: return as.boolean;
  case String: return as.string;
  case Number: return as.number;
  case Date: return as.date;
  case Function: return as.function();
  case JSON: return as.json;
  default:
    if (_.isArray(what)) {
      return as.array.with(what);
    } else if (_.isRegExp(what)) {
      return as.regexp(what);
    } else if (_.isObject(what)) {
      return what.__isChecker ? what : as.object.with(what);
    } else {
      return as.eq(what);
    }
  }
}

/**
 * Utility function for custom matchers, particularly for wrapping the three schema checking methods.
 * @param a function to indirectly create a checker method
 * @return a checker with its methods implemented accordingly
 */
as.indirect = function (method) {
  return {
    matches : method('matches'),
    coerce : method('coerce'),
    validate : method('validate')
  };
}

/**
 * The as function itself is a checker
 */
as.matches = _.constant(true);
as.coerce = _.identity;
as.validate = _.identity;

/**
 * A statically-allocated hash of prototypical schema interpretation methods, which are generally
 * available on every checker to refine the checking behaviour.
 * To customise schema interpretation, modify this hash before using the as function.
 */
as.checks = {
  def : require('./check/def'),
  or : require('./check/or'),
  and : require('./check/and'),
  with : require('./check/with'),
  regexp : require('./check/regexp')
};
_.each(['size', 'first', 'last', 'ceil', 'floor', 'max', 'mean', 'min', 'sum'], function (unary) {
  as.checks[unary] = require('./check/unary')(unary);
});
_.each(['eq', 'lt', 'lte', 'gt', 'gte'], function (op) {
  as.checks[op] = require('./check/binary')(op);
});

/**
 * Status reporting object. Pass a new one as the second argument to the coerce method
 * to discover what went wrong with validation.
 */
as.Status = function () {
  this.path = [];
  this.defs = {};
  this.failures = [];
}

as.Status.prototype.push = function (name, path) {
  path = _.compact(path.concat(name));
  this.path.push.apply(this.path, path);
  return path.length;
};

as.Status.prototype.pop = function (count) {
  _.times(count, _.bind(this.path.pop, this.path));
};

as.Status.prototype.failed = function () {
  var path = this.path.join('.');
  if (!_.some(this.failures, _.method('startsWith', path))) {
    this.failures.push(path);
  }
  return path || 'any';
};

/**
 * Utility method to hydrate a raw checker object (implementing matches, coerce and validate)
 * with status handling and chaining methods. This function can be used in-line during data type
 * creation, or as a utility when adding to as.checks.
 */
as.check = function (check, name) {
  // Entirely excusable sleight of hand to allow custom checkers
  check.__isChecker = true;
  check.name = name;

  return _.assign(check, as.indirect(function bindStatus(m) {
    var f = check[m];
    return function (value, status, key/*, ...*/) {
      status || (status = new as.Status());
      var count = status.push(name, _.slice(arguments, 2));
      try {
        var result = f(value, status);
        return (m !== 'matches' || result) ? result : !status.failed();
      } catch (err) {
        throw err.message ?
          _.set(err, 'message', err.message + ' at ' + status.failed()) : err;
      } finally {
        status.pop(count);
      }
    }
  }), as.checks);
}

/**
 * The static checker creation methods used to bootstrap a new data type declaration
 */
as.error = require('./check/static')('error', _.isUndefined, _.constant(undefined), 'Not allowed');
as.object = require('./check/static')('object', _.isObject, Object, 'Not an object');
as.array = require('./check/static')('array', _.isArray, _.castArray, 'Not an array');
as.boolean = require('./check/static')('boolean', _.isBoolean, Boolean, 'Not a boolean');
as.string = require('./check/static')('string', _.isString, String, 'Not a string');
as.number = require('./check/static')('number', _.isNumber, Number, 'Not a number');
as.function = require('./check/function');
as.date = require('./check/static')('date', _.isDate, function (value) {
  // The Date constructor is not idempotent
  return _.isDate(value) ? value : new Date(value);
}, 'Not a date');

function isJson(value) {
  try {
    return _.isString(value) && JSON.parse(value) && true;
  } catch (err) {
    return false;
  }
}
as.json = require('./check/static')('json', isJson, function (value) {
  // JSON.stringify is not idempotent
  return isJson(value) ? value : JSON.stringify(value);
}, 'Not JSON');

/**
 * The as function itself is a checker
 */
as.check(as);
