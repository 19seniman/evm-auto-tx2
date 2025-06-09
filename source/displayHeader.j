const colors = require("colors");

function displayHeader() {
  process.stdout.write("\x1Bc");
  console.log(colors.cyan("============================================="));
  console.log(colors.cyan("=        EVM Auto Transfer 2                ="));
  console.log(colors.cyan("=  Created by HCA & 19Seniman From Insider  ="));
  console.log(colors.cyan("=    https://t.me/HappyCuanAirdrop          ="));
  console.log(colors.cyan("============================================="));
  console.log();
}

module.exports = displayHeader;
