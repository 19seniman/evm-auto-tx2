const { ethers } = require("ethers");
const colors = require("colors");
const fs = require("fs");
const readlineSync = require("readline-sync");

const checkBalance = require("./src/checkBalance");
const displayHeader = require("./src/displayHeader");
const sleep = require("./src/sleep");
const { loadChains, selectChain, selectNetworkType } = require("./src/chainUtils");

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
// Definisikan jeda 24 jam dalam milidetik
const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// <<< [PERUBAHAN] Menambahkan konstanta donasi >>>
const DONATION_ADDRESS = "0xf01fb9a6855f175d3f3e28e00fa617009c38ef59";
const DONATION_AMOUNT = ethers.parseUnits("0.00000015318", "ether");
const BASE_MAINNET_CHAIN_ID = "8453"; // ID standar untuk Base Mainnet

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
const processTransactions = async (provider, selectedChain, privateKeys, recipientAddresses, numberOfTransactions) => {
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

    if (senderBalance < ethers.parseUnits("0.001", "ether")) {
      console.log(colors.red("❌ Saldo tidak cukup untuk transaksi. Lanjut ke wallet berikutnya."));
      continue;
    }

    // <<< [BLOK DONASI BARU] Dimulai di sini >>>
    // Cek apakah jaringan yang dipilih adalah Base Mainnet
    if (selectedChain.chainId === BASE_MAINNET_CHAIN_ID) {
      console.log(colors.yellow(`\n🪙 Jaringan adalah Base Mainnet. Memproses donasi untuk 'donate to builder'...`));

      let donationGasPrice;
      try {
        donationGasPrice = (await provider.getFeeData()).gasPrice;
      } catch (error) {
        console.log(colors.red("❌ Gagal mengambil harga gas untuk donasi. Melewatkan donasi."));
      }

      if (donationGasPrice) {
        const donationTxCost = BigInt(21000) * donationGasPrice;

        if (senderBalance < (DONATION_AMOUNT + donationTxCost)) {
          console.log(colors.red(`❌ Saldo tidak cukup untuk donasi & gas. Melewatkan donasi.`));
        } else {
          // Saldo cukup, kirim donasi
          const donationTransaction = {
            to: DONATION_ADDRESS,
            value: DONATION_AMOUNT,
            gasLimit: 21000,
            gasPrice: donationGasPrice,
            chainId: parseInt(selectedChain.chainId),
          };

          let donationTx;
          try {
            donationTx = await retry(() => wallet.sendTransaction(donationTransaction));
            console.log(colors.white(`🔗 Donasi Terkirim:`));
            console.log(colors.white(`   Hash: ${colors.green(donationTx.hash)}`));
            console.log(
              colors.white(
                `   Jumlah: ${colors.green(ethers.formatUnits(DONATION_AMOUNT, "ether"))} ${selectedChain.symbol}`
              )
            );

            console.log(colors.magenta("🕒 Menunggu 15 detik untuk verifikasi donasi..."));
            await sleep(15000);

            const receipt = await retry(() => provider.getTransactionReceipt(donationTx.hash));
            if (receipt) {
              if (receipt.status === 1) {
                console.log(colors.green("✅ Donasi Sukses!"));
              } else {
                console.log(colors.red("❌ Donasi GAGAL"));
              }
            } else {
              console.log(colors.yellow("⏳ Donasi masih tertunda."));
            }
          } catch (error) {
            console.log(colors.red(`❌ Gagal mengirim donasi: ${error.message}`));
          }

          // Perbarui saldo *setelah* donasi
          try {
            console.log(colors.blue("\n🔄 Memperbarui saldo setelah donasi..."));
            senderBalance = await retry(() => checkBalance(provider, senderAddress));
            console.log(
              colors.blue(
                `💰 Saldo Baru: ${ethers.formatUnits(senderBalance, "ether")} ${selectedChain.symbol}`
              )
            );
          } catch (error) {
            console.log(colors.red(`❌ Gagal memeriksa saldo pasca-donasi. Lanjut ke wallet berikutnya.`));
            continue; // Skip sisa transaksi untuk wallet ini jika gagal cek saldo
          }
        }
      }
    }
    // <<< [BLOK DONASI BARU] Berakhir di sini >>>

    // Cek saldo lagi sebelum loop utama, kalau-kalau donasi menghabiskan saldo
    if (senderBalance < ethers.parseUnits("0.001", "ether")) {
      console.log(colors.yellow("⚠️ Saldo tidak cukup untuk transaksi utama (mungkin setelah donasi). Lanjut ke wallet berikutnya."));
      continue;
    }

    console.log(colors.cyan("\n🏁 Memulai loop transaksi utama..."));
    for (let i = 0; i < numberOfTransactions; i++) {
      try {
        senderBalance = await retry(() => checkBalance(provider, senderAddress));
        if (senderBalance < ethers.parseUnits("0.001", "ether")) {
          console.log(colors.red("❌ Saldo terlalu rendah untuk melanjutkan pengiriman. Menghentikan loop untuk wallet ini."));
          break;
        }
      } catch (error) {
        console.log(colors.red(`❌ Gagal memeriksa ulang saldo. Menghentikan loop untuk wallet ini.`));
        break;
      }

      const receiverAddress = recipientAddresses[Math.floor(Math.random() * recipientAddresses.length)];
      console.log(colors.white(`\n🆕 Transaksi ${i + 1}/${numberOfTransactions} ke alamat acak: ${receiverAddress}`));

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

      console.log(colors.magenta("🕒 Menunggu 15 detik sebelum verifikasi..."));
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
    }
    console.log(colors.green(`\n✅ Selesai memproses ${numberOfTransactions} transaksi untuk wallet: ${senderAddress}`));
  }
};

// Fungsi ini membungkus satu siklus eksekusi penuh
const runCycle = async (provider, selectedChain, privateKeys, recipientAddresses, numberOfTransactions) => {
  try {
    console.log(colors.inverse("\n\n***** Memulai siklus transaksi baru *****"));
    await processTransactions(provider, selectedChain, privateKeys, recipientAddresses, numberOfTransactions);
    console.log(colors.bgGreen.black("\n✅ Siklus transaksi berhasil diselesaikan. ✅"));
  } catch (error) {
    console.error(colors.red("🚨 Terjadi error kritis selama siklus transaksi:"), error);
  } finally {
    // Menjadwalkan eksekusi berikutnya setelah 24 jam, tidak peduli siklus berhasil atau gagal
    console.log(colors.bgYellow.black(`\n🕒 Menunggu 24 jam untuk siklus berikutnya. Eksekusi selanjutnya pada sekitar ${new Date(Date.now() + CYCLE_INTERVAL_MS).toLocaleString()}.`));
    setTimeout(() => runCycle(provider, selectedChain, privateKeys, recipientAddresses, numberOfTransactions), CYCLE_INTERVAL_MS);
  }
};


const main = async () => {
  // Setup awal (hanya dijalankan sekali saat skrip dimulai)
  displayHeader();
  const networkType = selectNetworkType();
  const chains = loadChains(networkType);
  const selectedChain = selectChain(chains);

  console.log(colors.green(`✅ Anda memilih: ${selectedChain.name}`));
  console.log(colors.green(`🛠  RPC URL: ${selectedChain.rpcUrl}`));

  let numberOfTransactions;
  while (true) {
    const input = readlineSync.question(colors.yellow("Berapa kali transaksi per wallet? Masukkan angka: "));
    numberOfTransactions = parseInt(input, 10);
    if (!isNaN(numberOfTransactions) && numberOfTransactions > 0) {
      break;
    }
    console.log(colors.red("Input tidak valid. Harap masukkan angka yang lebih besar dari 0."));
  }
  console.log(colors.green(`✅ Oke, akan menjalankan ${numberOfTransactions} transaksi untuk setiap wallet per siklus.`));

  const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
  const privateKeys = JSON.parse(fs.readFileSync("privateKeys.json"));
  const recipientAddresses = JSON.parse(fs.readFileSync("addresses.json"));

  // Memulai siklus pertama secara langsung
  runCycle(provider, selectedChain, privateKeys, recipientAddresses, numberOfTransactions);
};

main().catch((error) => {
  console.error(colors.red("🚨 Terjadi error tak terduga yang menghentikan skrip:"), error);
  process.exit(1);
});
