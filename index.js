var _ = require('lodash');

/**
 * Main entry point for schema interpretation into a checker.
 * Each passed argument represents a data type, which are logically OR-ed.
 * @see https://github.com/gsvarovsky/yavl for the available data types and checker methods.
 * @param what... the data types
 * @return an interpreted schema checker with the methods: matches, cast and validate
 */
var as = module.exports = function as(what/*, ...*/) {
  if (arguments.length > 0) {
    if (arguments.length === 1) {
      return as1(what);
    } else {
      return as1(arguments[0]).or(as.apply(this, _.slice(arguments, 1)));
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
    } else if (_.isFunction(what)) {
      return what.__isChecker ? what : as.instanceof(what);
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
as.indirect = function (getMethod) {
  return {
    matches : getMethod('matches'),
    cast : getMethod('cast'),
    validate : getMethod('validate')
  };
}

/**
 * The as function itself is a checker
 */
as.matches = _.constant(true);
as.cast = _.identity;
as.validate = _.identity;

/**
 * Status reporting object. Pass a new one as the second argument to the cast method
 * to discover what went wrong with validation.
 */
as.Status = function (defs) {
  this.path = [];
  this.defs = defs || {};
  this.quality = 0;
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

as.Status.prototype.succeeded = function (result, weight) {
  weight = _.isUndefined(weight) ? 1 : weight;
  var path = this.path.join('.');
  if (result) {
    this.quality += weight;
  } else {
    this.quality -= weight;
    if (!_.some(this.failures, _.method('startsWith', path))) {
      this.failures.push(path);
    }
  }
  return path || 'any';
};

// NOTE deferred initialisation due to circular dependencies
var checks = require('./checks');

/**
 * Utility method to hydrate a raw checker object (implementing matches, cast and validate)
 * with status handling and chaining methods. This function can be used in-line during data type
 * creation, or as a utility when extending as.
 */
as.check = function (check, name, weight) {
  // Entirely excusable sleight of hand to allow custom checkers
  check.__isChecker = true;
  check.name = name;

  return _.assign(check, as.indirect(function bindStatus(methodName) {
    var method = check[methodName];
    return function (value, status, key/*, ...*/) {
      status || (status = new as.Status());
      var count = status.push(name, _.slice(arguments, 2));
      try {
        var result = method(value, status);
        status.succeeded(methodName !== 'matches' || result, weight);
        return result;
      } catch (err) {
        throw err.message ?
          _.set(err, 'message', err.message + ' at ' + status.succeeded(false, weight)) : err;
      } finally {
        status.pop(count);
      }
    }
  }), checks);
};

function isJson(value) {
  try {
    return _.isString(value) && JSON.parse(value) && true;
  } catch (err) {
    return false;
  }
}

/**
 * The static checker creation methods used to bootstrap a new data type declaration.
 * NOTE deferred initialisation due to circular dependencies
 */
var staticCheck = require('./checks/static');
var TYPE_WEIGHT = 0.5; // Type checking is a weak check compared to, say, equality
var statics = {
  error : staticCheck('error', _.isUndefined, _.constant(undefined), 'Not allowed'),
  object : staticCheck('object', _.isObject, Object, 'Not an object', TYPE_WEIGHT),
  array : staticCheck('array', _.isArray, _.castArray, 'Not an array', TYPE_WEIGHT),
  boolean : staticCheck('boolean', _.isBoolean, Boolean, 'Not a boolean', TYPE_WEIGHT),
  string : staticCheck('string', _.isString, function (value) {
    // Stringification of null and undefined is not pleasant
    return _.isUndefined(value) || _.isNull(value) ? '' : String(value);
  }, 'Not a string', TYPE_WEIGHT),
  number : staticCheck('number', _.isNumber, Number, 'Not a number', TYPE_WEIGHT),
  date : staticCheck('date', _.isDate, function (value) {
    // The Date constructor is not idempotent
    return _.isDate(value) ? value : new Date(value);
  }, 'Not a date', TYPE_WEIGHT),
  json : staticCheck('json', isJson, function (value) {
    // JSON.stringify is not idempotent
    return isJson(value) ? value : JSON.stringify(value);
  }, 'Not JSON', TYPE_WEIGHT),
  function : require('./checks/function'),
  instanceof : require('./checks/instanceof')
};
as = _.assign(as, statics);

as.extend = function (customChecks) {
  // Brute force for now - assign custom checks to instance methods, ourself and statics
  checks = _.assign(checks, customChecks);
  return _.assign(as, _.mapValues(statics, function (check) {
    return _.assign(check, customChecks);
  }), customChecks);
};

/**
 * The as function itself is a checker (with no weight)
 */
as.check(as, null, 0);
