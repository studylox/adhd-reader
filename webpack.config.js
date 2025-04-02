const path = require('path');

module.exports = {
  resolve: {
    fallback: {
      fs: false,
      http: false,
      https: false,
      url: false,
      zlib: false,
    },
    alias: {
      'pdfjs-dist': path.resolve(__dirname, 'node_modules/pdfjs-dist'),
    },
  },
}; 