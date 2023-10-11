const HttpError = require("../helpers/HttpError.js");

const validateBody = (schema) => {
  const func = (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      //   res.status(400);
      throw HttpError(400, error.message);
    }
    next();
  };
  return func;
};

module.exports = validateBody;
