const jwt = require('jsonwebtoken');

const generateToken = (userId, expiresIn) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'default_jwt_secret', {
    expiresIn: expiresIn || process.env.JWT_EXPIRE || '365d',
  });
};

module.exports = generateToken;
