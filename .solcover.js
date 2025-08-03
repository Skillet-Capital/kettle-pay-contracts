// .solcover.js
const filesToInclude = [
  'contracts/PaymentIntentHandler.sol',
];

module.exports = {
  fileFilter: (path) => {
    return filesToInclude.some((file) => path.endsWith(file));
  },
};