import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";

const connection = new Connection(RPC_URL, "confirmed");

// Load client wallet
let payer;
try {
  const keypairData = JSON.parse(readFileSync("./client-wallet.json", "utf-8"));
  payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log("Client wallet loaded:", payer.publicKey.toBase58());
} catch (error) {
  console.error("Error loading client wallet. Please create client-wallet.json");
  console.error(error.message);
  process.exit(1);
}

async function run() {
  console.log("\n💳 x402 Solana Payment Client\n");
  console.log("Step 1: Requesting payment quote from server...");

  // 1) Request payment quote from server
  const quote = await fetch(`${SERVER_URL}/premium`);
  const quoteData = await quote.json();

  if (quote.status !== 402) {
    throw new Error("Expected 402 quote response");
  }

  const paymentReq = quoteData.accepts[0];
  const recipientTokenAccount = new PublicKey(paymentReq.tokenAccount);
  const recipientWallet = new PublicKey(paymentReq.recipientWallet);
  const mint = new PublicKey(paymentReq.mint);
  const amount = paymentReq.amount;

  console.log("\n📋 Payment Required:");
  console.log(`  Amount: ${paymentReq.amountUSDC} USDC`);
  console.log(`  Recipient: ${paymentReq.recipientWallet}`);
  console.log(`  Token Account: ${paymentReq.tokenAccount}`);
  console.log(`  Network: ${paymentReq.network}`);

  // 2) Get or create the payer's associated token account
  console.log("\nStep 2: Preparing payer token account...");
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  console.log(`  Payer Token Account: ${payerTokenAccount.address.toBase58()}`);

  // Check if payer has enough USDC
  const balance = await connection.getTokenAccountBalance(
    payerTokenAccount.address
  );
  console.log(`  Current Balance: ${balance.value.uiAmountString} USDC`);

  if (Number(balance.value.amount) < amount) {
    throw new Error(
      `❌ Insufficient USDC balance. Have: ${balance.value.uiAmountString}, Need: ${paymentReq.amountUSDC}\n\n` +
        `💡 To fund your wallet with devnet USDC:\n` +
        `   1. Airdrop SOL: solana airdrop 2 ${payer.publicKey.toBase58()} --url devnet\n` +
        `   2. Get devnet USDC at: https://faucet.circle.com/ or use spl-token`
    );
  }

  // 3) Check if recipient token account exists
  console.log("\nStep 3: Verifying recipient token account...");
  let recipientAccountExists = false;
  try {
    await getAccount(connection, recipientTokenAccount);
    recipientAccountExists = true;
    console.log("  ✓ Recipient token account exists");
  } catch (error) {
    console.log("  ⚠ Recipient token account doesn't exist, will create it");
  }

  // 4) Create USDC transfer transaction
  console.log("\nStep 4: Building payment transaction...");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  });

  // Add create account instruction if needed
  if (!recipientAccountExists) {
    const createAccountIx = createAssociatedTokenAccountInstruction(
      payer.publicKey, // payer
      recipientTokenAccount, // associated token account address
      recipientWallet, // owner
      mint // mint
    );
    tx.add(createAccountIx);
    console.log("  + Added create token account instruction");
  }

  // Add transfer instruction
  const transferIx = createTransferInstruction(
    payerTokenAccount.address, // source
    recipientTokenAccount, // destination
    payer.publicKey, // owner
    amount // amount in smallest units
  );
  tx.add(transferIx);

  // Sign the transaction
  tx.sign(payer);

  // Serialize the signed transaction
  const serializedTx = tx.serialize().toString("base64");

  console.log(`  Transaction signed with ${tx.instructions.length} instruction(s)`);

  // 5) Create x402 payment proof
  console.log("\nStep 5: Creating x402 payment proof...");
  const paymentProof = {
    x402Version: 1,
    scheme: "exact",
    network: "solana-devnet",
    payload: {
      serializedTransaction: serializedTx,
    },
  };

  // Base64 encode the payment proof
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString(
    "base64"
  );

  // 6) Send payment to server
  console.log("\nStep 6: Submitting payment to server...");
  console.log("  (Server will submit transaction to Solana blockchain)");

  const paid = await fetch(`${SERVER_URL}/premium`, {
    headers: {
      "X-Payment": xPaymentHeader,
    },
  });

  const result = await paid.json();

  console.log("\n" + "=".repeat(60));
  if (paid.status === 200) {
    console.log("✅ PAYMENT SUCCESSFUL!\n");
    console.log("📦 Premium Content:");
    console.log(`  ${result.data}\n`);
    console.log("💰 Payment Details:");
    console.log(`  Amount Paid: ${result.paymentDetails.amountUSDC} USDC`);
    console.log(`  Transaction: ${result.paymentDetails.signature}`);
    console.log(`  Recipient: ${result.paymentDetails.recipient}\n`);
    console.log("🔗 View on Solana Explorer:");
    console.log(`  ${result.paymentDetails.explorerUrl}`);
  } else {
    console.log("❌ PAYMENT FAILED\n");
    console.log("Error:", result.error);
    if (result.details) {
      console.log("Details:", result.details);
    }
  }
  console.log("=".repeat(60) + "\n");
}

run().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});

