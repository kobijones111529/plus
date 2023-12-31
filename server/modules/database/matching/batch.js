const { runMatch } = require("./single");

/**
 * @returns {Promise<number>} Number of matches ran
 */
const runAllMatches = async () => {
  for (let i = 0; ; i++) {
    const matchRun = await runMatch();
    if (!matchRun) {
      return i;
    }
  }
};

module.exports = {
  runAllMatches,
};
