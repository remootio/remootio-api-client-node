module.exports = {
  'env': {
    'browser': true,
    'commonjs': true,
    'es2020': true,
  },
  //'extends': [
  //  'eslint:recommended',
  //],
  'parser': '@typescript-eslint/parser',
  'parserOptions': {
    'ecmaVersion': 'latest',
  },
  'plugins': [
    '@typescript-eslint',
  ],
  'rules': {
    'max-len': 'off',
  },
};
