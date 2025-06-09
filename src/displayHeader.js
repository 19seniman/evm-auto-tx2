const colors = require("colors");

function displayHeader() {
  process.stdout.write("\x1Bc");
  console.log(colors.cyan("========================================"));
  console.log(colors.cyan("=        EVM auto Tx2                  ="));
  console.log(colors.cyan("=     Author: HCA & !9Seniman          ="));
  console.log(colors.cyan("=   🍉🍉 FREE PALESTINE 🍉🍉         ="));
  console.log(colors.cyan("========================================"));
  console.log();
}

module.exports = displayHeader;
