var as = require('../index');

module.exports = function (what/*, ...*/) {
  var left = this, right = as.apply(null, arguments);
  return as.check({
    matches : function (value, status) {
      return left.matches(value, status) &&
        right.matches(left.cast(value, status), status, left.name);
    },
    cast : function (value, status) {
      return right.cast(left.cast(value, status), status, left.name);
    },
    validate : function (value, status) {
      return right.validate(left.validate(value, status), status, left.name);
    }
  }, null, 0); // Logical operator has no weight
};
