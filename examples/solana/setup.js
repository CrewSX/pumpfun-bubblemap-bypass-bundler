#!/usr/bin/env node

/**
 * Setup script for x402 Solana example
 * Generates wallets and provides funding instructions
 */

import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { writeFileSync, existsSync } from "fs";

const USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

console.log("\n🔧 x402 Solana Setup\n");
console.log("=".repeat(60));

// Generate server wallet
let serverWallet;
if (existsSync("./server-wallet.json")) {
  console.log("\n✓ Server wallet already exists (server-wallet.json)");
  const data = JSON.parse(
    await import("fs").then((fs) => fs.readFileSync("./server-wallet.json", "utf-8"))
  );
  serverWallet = Keypair.fromSecretKey(Uint8Array.from(data));
} else {
  console.log("\n📝 Generating server wallet...");
  serverWallet = Keypair.generate();
  writeFileSync(
    "./server-wallet.json",
    JSON.stringify(Array.from(serverWallet.secretKey))
  );
  console.log("✓ Server wallet created: server-wallet.json");
}

// Generate client wallet
let clientWallet;
if (existsSync("./client-wallet.json")) {
  console.log("✓ Client wallet already exists (client-wallet.json)");
  const data = JSON.parse(
    await import("fs").then((fs) => fs.readFileSync("./client-wallet.json", "utf-8"))
  );
  clientWallet = Keypair.fromSecretKey(Uint8Array.from(data));
} else {
  console.log("📝 Generating client wallet...");
  clientWallet = Keypair.generate();
  writeFileSync(
    "./client-wallet.json",
    JSON.stringify(Array.from(clientWallet.secretKey))
  );
  console.log("✓ Client wallet created: client-wallet.json");
}

console.log("\n" + "=".repeat(60));
console.log("\n📋 Wallet Addresses:\n");
console.log(`Server: ${serverWallet.publicKey.toBase58()}`);
console.log(`Client: ${clientWallet.publicKey.toBase58()}`);

// Get token accounts
const serverTokenAccount = await getAssociatedTokenAddress(
  USDC_MINT,
  serverWallet.publicKey
);
const clientTokenAccount = await getAssociatedTokenAddress(
  USDC_MINT,
  clientWallet.publicKey
);

console.log("\n📋 USDC Token Accounts:\n");
console.log(`Server: ${serverTokenAccount.toBase58()}`);
console.log(`Client: ${clientTokenAccount.toBase58()}`);

// Check balances
console.log("\n" + "=".repeat(60));
console.log("\n💰 Checking Balances...\n");

try {
  const serverBalance = await connection.getBalance(serverWallet.publicKey);
  console.log(`Server SOL: ${serverBalance / 1e9} SOL`);
} catch (e) {
  console.log("Server SOL: 0 SOL (not funded)");
}

try {
  const clientBalance = await connection.getBalance(clientWallet.publicKey);
  console.log(`Client SOL: ${clientBalance / 1e9} SOL`);
  
  if (clientBalance === 0) {
    console.log("\n⚠️  Client needs SOL for transaction fees!");
  }
} catch (e) {
  console.log("Client SOL: 0 SOL (not funded)");
  console.log("\n⚠️  Client needs SOL for transaction fees!");
}

try {
  const clientTokenBalance = await connection.getTokenAccountBalance(
    clientTokenAccount
  );
  console.log(`Client USDC: ${clientTokenBalance.value.uiAmountString} USDC`);
  
  if (Number(clientTokenBalance.value.amount) < 1000000) {
    console.log("\n⚠️  Client needs USDC to make payments!");
  }
} catch (e) {
  console.log("Client USDC: 0 USDC (token account not created)");
  console.log("\n⚠️  Client needs USDC to make payments!");
}

// Funding instructions
console.log("\n" + "=".repeat(60));
console.log("\n📚 Next Steps:\n");

console.log("1. Fund the client wallet with devnet SOL:");
console.log(`   solana airdrop 2 ${clientWallet.publicKey.toBase58()} --url devnet`);

console.log("\n2. Get devnet USDC for the client:");
console.log("   Option A: Circle USDC Faucet");
console.log("   - Visit: https://faucet.circle.com/");
console.log(`   - Enter address: ${clientWallet.publicKey.toBase58()}`);
console.log("   - Request devnet USDC");

console.log("\n   Option B: SPL Token CLI");
console.log(`   spl-token create-account ${USDC_MINT.toBase58()} --owner ${clientWallet.publicKey.toBase58()} --url devnet`);

console.log("\n3. Run the example:");
console.log("   Terminal 1: npm run server");
console.log("   Terminal 2: npm run client");

console.log("\n" + "=".repeat(60));
console.log("\n✅ Setup complete! Follow the steps above to fund wallets.\n");

