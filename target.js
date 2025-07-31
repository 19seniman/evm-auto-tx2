const { ethers } = require("ethers");
const colors = require("colors");
const fs = require("fs");
// 'readline-sync' tidak lagi diperlukan karena prosesnya otomatis
// const readlineSync = require("readline-sync"); 

const checkBalance = require("./src/checkBalance");
const displayHeader = require("./src/displayHeader");
const sleep = require("./src/sleep");
const { loadChains, selectChain, selectNetworkType } = require("./src/chainUtils");

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
// Atur jeda (dalam menit) antara setiap siklus pengiriman dari semua wallet
const CYCLE_DELAY_MINUTES = 10; 

async function retry(fn, maxRetries = MAX_RETRIES, delay = RETRY_DELAY) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(colors.yellow(`⚠️ Terjadi error. Mencoba lagi... (${i + 1}/${maxRetries})`));
      await sleep(delay);
    }
  }
}

// Fungsi ini berisi logika utama untuk memproses satu siklus transaksi
const processTransactions = async (provider, selectedChain, privateKeys, recipientAddresses) => {
  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const senderAddress = wallet.address;

    console.log(colors.cyan(`\n================================================================`));
    console.log(colors.cyan(`💼 Memproses wallet: ${senderAddress}`));
    console.log(colors.cyan(`================================================================`));

    let senderBalance;
    try {
      senderBalance = await retry(() => checkBalance(provider, senderAddress));
      console.log(
        colors.blue(
          `💰 Saldo Saat Ini: ${ethers.formatUnits(senderBalance, "ether")} ${selectedChain.symbol}`
        )
      );
    } catch (error) {
      console.log(colors.red(`❌ Gagal memeriksa saldo untuk ${senderAddress}. Lanjut ke wallet berikutnya.`));
      continue;
    }
    
    // Minimal saldo yang dibutuhkan untuk gas fee
    if (senderBalance < ethers.parseUnits("0.001", "ether")) {
      console.log(colors.red("❌ Saldo tidak cukup untuk transaksi. Lanjut ke wallet berikutnya."));
      continue;
    }

    // Loop melalui setiap alamat penerima dan kirim satu transaksi
    for (const receiverAddress of recipientAddresses) {
      // Periksa ulang saldo sebelum setiap pengiriman untuk memastikan dana masih ada
      try {
        senderBalance = await retry(() => checkBalance(provider, senderAddress));
        if (senderBalance < ethers.parseUnits("0.001", "ether")) {
          console.log(colors.red("❌ Saldo terlalu rendah untuk melanjutkan pengiriman. Menghentikan loop untuk wallet ini."));
          break; // Keluar dari loop penerima
        }
      } catch (error) {
        console.log(colors.red(`❌ Gagal memeriksa ulang saldo. Menghentikan loop untuk wallet ini.`));
        break;
      }

      console.log(colors.white(`\n🆕 Mengirim transaksi ke: ${receiverAddress}`));

      const amountToSend = ethers.parseUnits(
        (Math.random() * (0.0000001 - 0.00000001) + 0.00000001).toFixed(10).toString(),
        "ether"
      );

      let gasPrice;
      try {
        gasPrice = (await provider.getFeeData()).gasPrice;
      } catch (error) {
        console.log(colors.red("❌ Gagal mengambil harga gas. Melewatkan transaksi ini."));
        continue;
      }
      
      const txCost = BigInt(21000) * gasPrice;
      if (senderBalance < (amountToSend + txCost)) {
        console.log(colors.yellow(`⚠️ Saldo tidak cukup untuk jumlah kirim & estimasi gas. Melewatkan transaksi.`));
        continue;
      }

      const transaction = {
        to: receiverAddress,
        value: amountToSend,
        gasLimit: 21000,
        gasPrice: gasPrice,
        chainId: parseInt(selectedChain.chainId),
      };

      let tx;
      try {
        tx = await retry(() => wallet.sendTransaction(transaction));
        console.log(colors.white(`🔗 Transaksi Terkirim:`));
        console.log(colors.white(`  Hash: ${colors.green(tx.hash)}`));
        console.log(
          colors.white(`  Jumlah: ${colors.green(ethers.formatUnits(amountToSend, "ether"))} ${selectedChain.symbol}`)
        );
      } catch (error) {
        console.log(colors.red(`❌ Gagal mengirim transaksi: ${error.message}`));
        continue;
      }

      // Beri jeda 15 detik sebelum melanjutkan ke penerima berikutnya atau verifikasi
      await sleep(15000);

      try {
        const receipt = await retry(() => provider.getTransactionReceipt(tx.hash));
        if (receipt) {
          if (receipt.status === 1) {
            console.log(colors.green("✅ Transaksi Sukses!"));
            console.log(colors.green(`  Explorer: ${selectedChain.explorer}/tx/${receipt.hash}`));
          } else {
            console.log(colors.red("❌ Transaksi GAGAL"));
          }
        } else {
          console.log(colors.yellow("⏳ Transaksi masih tertunda setelah beberapa kali percobaan."));
        }
      } catch (error) {
        console.log(colors.red(`❌ Error saat memeriksa status transaksi: ${error.message}`));
      }
    } // Akhir dari loop penerima

    console.log(colors.green(`\n✅ Selesai memproses siklus untuk wallet: ${senderAddress}`));
  } // Akhir dari loop private key
};

const main = async () => {
  const DURATION_MS = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik

  console.log(colors.bgGreen.black(`🚀 Memulai skrip transaksi otomatis selama 24 jam... `));
  console.log(colors.bgYellow.black(`Skrip akan berhenti secara otomatis setelah 24 jam.`));

  // Timer untuk menghentikan skrip setelah 24 jam
  setTimeout(() => {
    console.log(colors.bgGreen.black("\n🏁 Durasi 24 jam telah berakhir. Menghentikan skrip."));
    console.log(colors.green("Donate: 0xf01fb9a6855f175d3f3e28e00fa617009c38ef59."));
    process.exit(0);
  }, DURATION_MS);

  // Setup awal
  displayHeader();
  const networkType = selectNetworkType();
  const chains = loadChains(networkType);
  const selectedChain = selectChain(chains);

  console.log(colors.green(`✅ Anda memilih: ${selectedChain.name}`));
  console.log(colors.green(`🛠 RPC URL: ${selectedChain.rpcUrl}`));
  
  const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
  const privateKeys = JSON.parse(fs.readFileSync("privateKeys.json"));
  const recipientAddresses = JSON.parse(fs.readFileSync("addresses.json"));

  // Loop tak terbatas untuk menjalankan proses
  while (true) {
    try {
      console.log(colors.inverse("\n***** Memulai siklus transaksi baru *****"));
      await processTransactions(provider, selectedChain, privateKeys, recipientAddresses);
      console.log(colors.inverse(`***** Siklus selesai. Menunggu ${CYCLE_DELAY_MINUTES} menit sebelum memulai siklus berikutnya. *****`));
      await sleep(CYCLE_DELAY_MINUTES * 60 * 1000);
    } catch (error) {
      console.error(colors.red("🚨 Terjadi error kritis di loop utama:"), error);
      console.log(colors.yellow("Mencoba memulai ulang siklus setelah jeda singkat..."));
      await sleep(60000); // Tunggu 1 menit sebelum mencoba lagi
    }
  }
};

main().catch((error) => {
  console.error(colors.red("🚨 Terjadi error tak terduga yang menghentikan skrip:"), error);
  process.exit(1);
});
